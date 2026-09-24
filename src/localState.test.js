import {normalizeUiState,readScoped,removeScoped,resolveActiveDay,scopedKey,writeScoped} from "./localState";

const storage=()=>{
  const values=new Map();
  return{getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
};

test("mantiene estado local aislado por usuario",()=>{
  const ls=storage();
  writeScoped(ls,"user-a","work",{id:"a"});
  writeScoped(ls,"user-b","work",{id:"b"});
  expect(readScoped(ls,"user-a","work")).toEqual({id:"a"});
  expect(readScoped(ls,"user-b","work")).toEqual({id:"b"});
  expect(scopedKey("user-a","work")).not.toBe(scopedKey("user-b","work"));
  removeScoped(ls,"user-a","work");
  expect(readScoped(ls,"user-a","work",null)).toBeNull();
  expect(readScoped(ls,"user-b","work")).toEqual({id:"b"});
});

test("un error de nube no borra una jornada local",()=>{
  const localDay={id:"local",date:"2026-09-23",startTime:123,running:true};
  expect(resolveActiveDay({localDay,cloudDay:null,cloudError:{message:"offline"}})).toBe(localDay);
  expect(resolveActiveDay({localDay,cloudDay:null,cloudError:null})).toBeNull();
});

test("la jornada confirmada en nube reemplaza la copia local",()=>{
  expect(resolveActiveDay({localDay:{id:"old"},cloudDay:{id:"new",date:"2026-09-23",start_time:"2026-09-23T12:00:00.000Z"},cloudError:null})).toEqual({
    id:"new",date:"2026-09-23",startTime:new Date("2026-09-23T12:00:00.000Z").getTime(),running:true,
  });
});

test("normaliza navegación persistida y descarta valores inválidos",()=>{
  expect(normalizeUiState({tab:"stats",tripsSection:"shifts",extraType:"bonus"})).toEqual({tab:"stats",tripsSection:"shifts",extraType:"bonus"});
  expect(normalizeUiState({tab:"admin",tripsSection:"unknown",extraType:"oops"})).toEqual({tab:"home",tripsSection:"trips",extraType:"all"});
});
