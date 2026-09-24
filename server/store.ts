import mongoose from 'mongoose';
import type { State } from './domain.js';
import { seed, interruptTasks } from './domain.js';
import {ensureCropProfiles} from './crops.js';
// Bounded aggregate: one atomic snapshot keeps tasks, delivered volume and device readings consistent.
const Snapshot=mongoose.model('SimulationSnapshot',new mongoose.Schema({_id:String,payload:{type:mongoose.Schema.Types.Mixed,required:true}},{versionKey:false}));
export class Store{
 state:State=seed(); private queue:Promise<unknown>=Promise.resolve();
 async init(uri:string,dbName:string){
  if(!/^smart_planter_(demo|test_[a-zA-Z0-9_]+)$/.test(dbName))throw new Error('Database must be smart_planter_demo or smart_planter_test_*');
  await mongoose.connect(uri,{dbName,serverSelectionTimeoutMS:5000});
  await ensureCropProfiles();
  const old=await Snapshot.findById('main').lean();
  this.state=old?old.payload as State:seed();
  // Apply topology/default-reading migrations once, then preserve live demo readings.
  const fresh=seed(new Date(this.state.clock));
  if(this.state.dataRevision!==fresh.dataRevision){this.state.devices=fresh.devices;this.state.tasks=[];this.state.dataRevision=fresh.dataRevision;}
  else{const existing=new Map(this.state.devices.map(device=>[device.id,device]));this.state.devices=fresh.devices.map(device=>{const previous=existing.get(device.id);return previous?{...device,...previous,name:device.name,nameEn:device.nameEn,cropId:device.cropId,growthStage:device.growthStage,location:device.location}:device;});}
  interruptTasks(this.state);await this.save();
 }
 private async save(){await Snapshot.replaceOne({_id:'main'},{_id:'main',payload:this.state},{upsert:true});}
 async mutate<T>(fn:(s:State)=>T|Promise<T>):Promise<T>{
  const job=this.queue.then(async()=>{const before=structuredClone(this.state);try{const result=await fn(this.state);await this.save();return result;}catch(e){this.state=before;throw e;}});
  this.queue=job.catch(()=>{});return job;
 }
 async read(){await this.queue;return structuredClone(this.state);}
 async close(){await this.queue;await mongoose.disconnect();}
}
