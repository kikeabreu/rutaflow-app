import {Capacitor,registerPlugin} from "@capacitor/core";
import {locationConsentGranted} from "./consent";

const NativeTracking=registerPlugin("RuletoTracking");
const android=()=>Capacitor.isNativePlatform()&&Capacitor.getPlatform()==="android";
const noConsent={supported:true,running:false,state:"no_consent",message:"Activa el consentimiento de ubicación en Configuración"};
const unavailable={supported:false,running:false,state:"unsupported",message:"Disponible en la app Android"};

export const nativeTracking={
  supported:()=>android()?NativeTracking.supported():Promise.resolve(unavailable),
  startSession:options=>android()?(locationConsentGranted()?NativeTracking.startSession(options||{}):Promise.resolve(noConsent)):Promise.resolve(unavailable),
  startSegment:(type,options={})=>android()?(locationConsentGranted()?NativeTracking.startSegment({type,...options}):Promise.resolve(noConsent)):Promise.resolve(unavailable),
  endSegment:()=>android()?NativeTracking.endSegment():Promise.resolve(unavailable),
  stopSession:()=>android()?NativeTracking.stopSession():Promise.resolve(unavailable),
  status:()=>android()?NativeTracking.status():Promise.resolve(unavailable),
  // checkPermissions/requestPermissions los genera Capacitor a partir de los
  // alias declarados en el plugin. Fuera de Android no hay nada que pedir.
  checkPermissions:()=>android()?NativeTracking.checkPermissions():Promise.resolve({location:"granted",notifications:"granted"}),
  requestPermissions:aliases=>android()?NativeTracking.requestPermissions(aliases?{permissions:aliases}:undefined):Promise.resolve({location:"granted",notifications:"granted"}),
  readPending:(userId,limit=500)=>android()?NativeTracking.readPending({userId,limit}):Promise.resolve({points:[]}),
  ack:(userId,sampleIds)=>android()?NativeTracking.ack({userId,sampleIds:Array.isArray(sampleIds)?sampleIds:[]}):Promise.resolve({acknowledged:0}),
};
