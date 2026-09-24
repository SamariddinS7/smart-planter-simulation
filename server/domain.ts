export type Lang='zh'|'en'|'uz';
export type GrowthStage='seedling'|'vegetative'|'flowering'|'fruiting';
export type CropProfile={id:string;nameZh:string;nameUz:string;nameEn:string;category:string;temperature:{min:number;optimalMin:number;optimalMax:number;max:number};moisture:{critical:number;targetMin:number;targetMax:number;max:number};lightHours:{min:number;max:number};irrigation:{maxVolume:number;minIntervalMinutes:number};version:number;updatedAt:string};
export type Device={id:string;name:string;nameEn:string;cropId:string;growthStage:GrowthStage;location:'office'|'greenhouse';online:boolean;moisture:number;temperature:number;light:number;lastSeen:string;history:Point[]};
export type Point={at:string;value:number};
export type Evidence={at:string;deviceId:string;moisture:number;temperature:number;light:number;online:boolean;summary:string;sources:{title:string;url:string;note:string}[]};
export type Message={id:string;deviceId:string;role:'user'|'assistant';content:string;at:string;lang:Lang;mode:'real'|'simulation';evidence?:Evidence};
export type TaskResult={deviceId:string;status:'pending'|'running'|'success'|'failed';progress:number;delivered:number;message:string;at:string;initialMoisture:number;targetMoisture:number;maxVolume:number;elapsedSeconds:number;maxDurationSeconds:number};
export type Task={id:string;requestId:string;type:'check'|'water';volume:number;createdAt:string;status:'pending'|'running'|'success'|'failed';results:TaskResult[]};
export type Forecast={id:string;deviceId:string;at:string;temperature:number;light:number;rate:number;baselineRate:number;threshold:number;crossing:number|null;history:Point[];future:{hours:number;value:number;low:number;high:number;baseline:number}[];simulated:true};
export type State={version:number;dataRevision:number;clock:string;paused:boolean;aiUnavailable:boolean;devices:Device[];tasks:Task[];messages:Message[];forecasts:Forecast[]};
export class ApiError extends Error { constructor(public status:number,public code:string,message:string){super(message);} }
export const clamp=(n:number,min=0,max=100)=>Math.min(max,Math.max(min,n));
export const round=(n:number)=>Math.round(n*100)/100;
export function seed(now=new Date()):State{
 const clock=now.toISOString();
 const defs=[
  ['A01','生菜（A区1号）','Lettuce zone A1','lettuce','vegetative','greenhouse',true,66,23,5],
  ['A02','小白菜（A区2号）','Bok choy zone A2','bok-choy','vegetative','greenhouse',true,68,24,5],
  ['A03','玉米（A区3号）','Corn zone A3','corn','vegetative','greenhouse',true,42,27,7],
  ['A04','罗勒（A区4号）','Basil zone A4','basil','vegetative','greenhouse',true,65,25,6],
  ['B01','番茄（B区1号）','Tomato zone B1','tomato','fruiting','greenhouse',true,68,26,7],
  ['B02','番茄（B区2号）','Tomato zone B2','tomato','fruiting','greenhouse',true,34,28,7],
  ['B03','番茄（B区3号）','Tomato zone B3','tomato','fruiting','greenhouse',true,68,27,7],
  ['B04','草莓（B区4号）','Strawberry zone B4','strawberry','fruiting','greenhouse',true,44,25,6],
  ['C01','黄瓜（C区1号）','Cucumber zone C1','cucumber','fruiting','greenhouse',true,72,27,6],
  ['C02','甜瓜（C区2号）','Melon zone C2','melon','flowering','greenhouse',true,60,28,7],
  ['C03','黄瓜（C区3号）','Cucumber zone C3','cucumber','fruiting','greenhouse',true,39,29,7],
  ['C04','甜瓜（C区4号）','Melon zone C4','melon','flowering','greenhouse',true,68,27,6],
  ['D01','菠菜（D区1号）','Spinach zone D1','spinach','vegetative','greenhouse',true,70,22,5],
  ['D02','香葱（D区2号）','Green onion zone D2','green-onion','vegetative','greenhouse',true,52,24,5],
  ['D03','玉米（D区3号）','Corn zone D3','corn','vegetative','greenhouse',true,70,27,7],
  ['D04','玉米（D区4号）','Corn zone D4','corn','vegetative','greenhouse',true,46,28,7]
 ] as const;
 return {version:1,dataRevision:3,clock,paused:false,aiUnavailable:false,tasks:[],messages:[],forecasts:[],devices:defs.map(([id,name,nameEn,cropId,growthStage,location,online,moisture,temperature,light])=>{const phase=id.charCodeAt(0)+Number(id.slice(1))*1.7;return {id,name,nameEn,cropId,growthStage,location,online,moisture,temperature,light,lastSeen:new Date(+now-(online?0:20*60000)).toISOString(),history:Array.from({length:25},(_,i)=>({at:new Date(+now-(24-i)*3600000-(online?0:20*60000)).toISOString(),value:i===24?moisture:round(clamp(moisture+(24-i)*.28+Math.sin(i*.82+phase)*2.4+Math.cos(i*.37+phase)*1.1))}))};})};
}
export function forecast(device:Device,temperature:number,light:number,at:string):Forecast{
 if(!device.online)throw new ApiError(409,'DEVICE_OFFLINE','设备离线，无法生成预测');
 if(device.history.length<7)throw new ApiError(409,'INSUFFICIENT_DATA','历史数据不足，至少需要7个采样点');
 // Fit last six simulation hours, not last six one-minute tick samples.
 const end=new Date(device.lastSeen).getTime();
 const recent=device.history.filter(p=>new Date(p.at).getTime()>=end-6*3600000);
 if(recent.length<2)throw new ApiError(409,'INSUFFICIENT_DATA','有效历史数据不足');
 const xs=recent.map(p=>(new Date(p.at).getTime()-end)/3600000), ys=recent.map(p=>p.value);
 const mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;
 const denom=xs.reduce((a,x)=>a+(x-mx)**2,0);
 if(denom===0)throw new ApiError(409,'INSUFFICIENT_DATA','历史数据时间范围不足');
 const slope=xs.reduce((a,x,i)=>a+(x-mx)*(ys[i]-my),0)/denom;
 const baselineRate=round(clamp(-slope,0,4));
 // Explainable deterministic scenario model; not a trained ML model or agronomic recommendation.
 const rate=round(clamp(0.5+0.04*(temperature-22)+0.035*(light-4),0.15,2));
 const threshold=25;
 const rawCross=device.moisture<=threshold?0:(device.moisture-threshold)/rate;
 return {id:crypto.randomUUID(),deviceId:device.id,at,temperature,light,rate,baselineRate,threshold,crossing:rawCross<=12?round(rawCross):null,history:device.history.filter(p=>+new Date(p.at)>=+new Date(at)-24*3600000),future:Array.from({length:13},(_,h)=>({hours:h,value:round(clamp(device.moisture-rate*h)),low:round(clamp(device.moisture-rate*h-0.22*h)),high:round(clamp(device.moisture-rate*h+0.22*h)),baseline:round(clamp(device.moisture-baselineRate*h))})),simulated:true};
}
export function tick(state:State){
 if(state.paused)return;
 const next=new Date(+new Date(state.clock)+60000).toISOString(); state.clock=next;
 for(const d of state.devices){if(d.online){const minute=+new Date(next)/60000,phase=d.id.charCodeAt(0)+Number(d.id.slice(1));const loss=Math.max(.003,.012+Math.sin(minute/17+phase)*.007);d.moisture=round(clamp(d.moisture-loss));d.lastSeen=next;const sensorNoise=Math.sin(minute/5+phase)*.35+Math.cos(minute/11+phase)*.18;d.history.push({at:next,value:round(clamp(d.moisture+sensorNoise))});d.history=d.history.filter(p=>+new Date(p.at)>=+new Date(next)-25*3600000);}}
 for(const t of state.tasks){if(t.status==='success'||t.status==='failed')continue;
  for(const r of t.results){if(r.status==='success'||r.status==='failed')continue;
   const d=state.devices.find(d=>d.id===r.deviceId)!;r.at=next;
   if(!d.online){r.status='failed';r.message='DEVICE_OFFLINE';continue;}
   if(r.status==='pending'){r.status='running';r.message='RUNNING';continue;}
   r.elapsedSeconds+=1;
   if(t.type==='water'){
    const flowPerSecond=10;
    const remainingVolume=Math.max(0,r.maxVolume-r.delivered);
    // Demo calibration: 1 mL raises the virtual sensor by 1 percentage point.
    const volumeToTarget=Math.max(0,r.targetMoisture-d.moisture);
    const delta=round(Math.min(flowPerSecond,remainingVolume,volumeToTarget));
    r.delivered=round(r.delivered+delta);d.moisture=round(clamp(d.moisture+delta));
    const span=Math.max(0.01,r.targetMoisture-r.initialMoisture);r.progress=Math.min(100,Math.round((d.moisture-r.initialMoisture)/span*100));
    if(d.history.length)d.history[d.history.length-1].value=d.moisture;
    if(d.moisture>=r.targetMoisture){r.status='success';r.progress=100;r.message='TARGET_MOISTURE_REACHED';}
    else if(r.delivered>=r.maxVolume){r.status='failed';r.message='MAX_VOLUME_REACHED';}
    else if(r.elapsedSeconds>=r.maxDurationSeconds){r.status='failed';r.message='MAX_DURATION_REACHED';}
   }else{
    r.progress=Math.min(100,r.progress+25);
    if(r.progress===100){r.status='success';r.message=d.moisture<35?'CHECK_NEEDS_CARE':'CHECK_NORMAL';}
   }
  }
  t.status=t.results.every(r=>r.status==='success'||r.status==='failed')?(t.results.some(r=>r.status==='failed')?'failed':'success'):'running';
 }
}
export function interruptTasks(state:State){for(const t of state.tasks){if(t.status==='pending'||t.status==='running'){t.status='failed';for(const r of t.results)if(r.status==='pending'||r.status==='running'){r.status='failed';r.message='SERVER_RESTART';r.at=state.clock;}}}}
