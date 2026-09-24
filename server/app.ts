import express from 'express';
import rateLimit from 'express-rate-limit';
import { z,ZodError } from 'zod';
import path from 'node:path';
import { ApiError,seed,forecast,round,type Task,type Message } from './domain.js';
import { evidenceFor,knowledgeReply,realReply,simulatedReply,type AIConfig,type KnowledgeContext } from './ai.js';
import type { Store } from './store.js';
import {createCropProfile,deleteCropProfile,listCropProfiles,updateCropProfile} from './crops.js';
const deviceId=z.enum(['A01','A02','A03','A04','B01','B02','B03','B04','C01','C02','C03','C04','D01','D02','D03','D04']);
function sampledTrend<T extends {at:string}>(history:T[],clock:string){const recent=history.filter(point=>+new Date(point.at)>=+new Date(clock)-12*3600000);if(recent.length<=13)return recent;return Array.from({length:13},(_,index)=>recent[Math.round(index*(recent.length-1)/12)]);}
const cropProfileBody=z.object({
 id:z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/),nameZh:z.string().trim().min(1).max(40),nameUz:z.string().trim().min(1).max(60),nameEn:z.string().trim().min(1).max(60),category:z.string().trim().min(1).max(80),
 temperature:z.object({min:z.number().min(-20).max(60),optimalMin:z.number().min(-20).max(60),optimalMax:z.number().min(-20).max(60),max:z.number().min(-20).max(60)}),
 moisture:z.object({critical:z.number().min(0).max(100),targetMin:z.number().min(0).max(100),targetMax:z.number().min(0).max(100),max:z.number().min(0).max(100)}),
 lightHours:z.object({min:z.number().min(0).max(24),max:z.number().min(0).max(24)}),irrigation:z.object({maxVolume:z.number().min(10).max(300),minIntervalMinutes:z.number().int().min(15).max(1440)})
}).superRefine((value,ctx)=>{
 if(!(value.temperature.min<=value.temperature.optimalMin&&value.temperature.optimalMin<value.temperature.optimalMax&&value.temperature.optimalMax<=value.temperature.max))ctx.addIssue({code:'custom',path:['temperature'],message:'温度范围顺序无效'});
 if(!(value.moisture.critical<=value.moisture.targetMin&&value.moisture.targetMin<value.moisture.targetMax&&value.moisture.targetMax<=value.moisture.max))ctx.addIssue({code:'custom',path:['moisture'],message:'湿度范围顺序无效'});
 if(value.lightHours.min>=value.lightHours.max)ctx.addIssue({code:'custom',path:['lightHours'],message:'光照时长范围无效'});
});
export function createApp(store:Store,ai:AIConfig,fetcher:typeof fetch=fetch){
 const app=express();app.disable('x-powered-by');app.use(express.json({limit:'24kb'}));
 const api=express.Router();
 api.use(rateLimit({windowMs:60000,limit:300,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RATE_LIMIT',message:'请求过于频繁，请稍后重试'}}}));
 api.get('/health',async(_req,res)=>res.json({ok:true,aiConfigured:Boolean(ai.key&&ai.model),dataMode:'simulation'}));
 api.get('/state',async(_req,res)=>{const s=await store.read();res.json({...s,devices:s.devices.map(({history,...d})=>({...d,history:sampledTrend(history,s.clock),sampleCount:history.length})),forecasts:undefined,messages:undefined,aiConfigured:Boolean(ai.key&&ai.model),simulated:true});});
 api.get('/crop-profiles',async(_req,res)=>res.json(await listCropProfiles()));
 api.post('/crop-profiles',async(req,res)=>res.status(201).json(await createCropProfile(cropProfileBody.parse(req.body))));
 api.put('/crop-profiles/:id',async(req,res)=>res.json(await updateCropProfile(req.params.id,cropProfileBody.parse(req.body))));
 api.delete('/crop-profiles/:id',async(req,res)=>{const s=await store.read();if(s.devices.some(device=>device.cropId===req.params.id))throw new ApiError(409,'CROP_IN_USE','该作物已分配给灌溉分区，不能删除');await deleteCropProfile(req.params.id);res.status(204).end();});
 api.get('/devices/:id',async(req,res)=>{const s=await store.read();const d=s.devices.find(d=>d.id===req.params.id);if(!d)throw new ApiError(404,'NOT_FOUND','设备不存在');res.json({...d,simulated:true});});
 api.get('/conversations/:deviceId',async(req,res)=>{const s=await store.read();res.json(s.messages.filter(m=>m.deviceId===req.params.deviceId));});
 api.post('/chat',rateLimit({windowMs:60000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RATE_LIMIT',message:'提问过于频繁，请稍后重试'}}}),async(req,res)=>{
  const body=z.object({deviceId,question:z.string().trim().min(1).max(1000),lang:z.enum(['zh','en']),mode:z.enum(['real','simulation'])}).parse(req.body);
  const s=await store.read();const d=s.devices.find(d=>d.id===body.deviceId)!;const evidence=evidenceFor(d);
  if(body.mode==='real'&&s.aiUnavailable)throw new ApiError(503,'AI_UNAVAILABLE','已模拟AI不可用，请切换仿真问答');
  const content=body.mode==='simulation'?simulatedReply(body.question,d,body.lang):await realReply(body.question,s.messages.filter(m=>m.deviceId===d.id),evidence,body.lang,ai,fetcher);
  const result=await store.mutate(current=>{
   if(current.version!==s.version)throw new ApiError(409,'DEMO_RESET','演示数据已重置，请重新提问');
   const shared={deviceId:d.id,at:current.clock,lang:body.lang,mode:body.mode};
   const user:Message={...shared,id:crypto.randomUUID(),role:'user',content:body.question};
   const assistant:Message={...shared,id:crypto.randomUUID(),role:'assistant',content,evidence};
   current.messages.push(user,assistant);current.messages=current.messages.slice(-300);return [user,assistant];
  });res.json(result);
 });
 api.get('/knowledge/conversations/:scope',async(req,res)=>{const scope=req.params.scope;if(scope!=='all'&&!deviceId.safeParse(scope).success)throw new ApiError(400,'VALIDATION','分析范围无效');const s=await store.read();res.json(s.messages.filter(message=>message.deviceId===`knowledge:${scope}`).slice(-30));});
 api.post('/knowledge/chat',rateLimit({windowMs:60000,limit:8,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'RATE_LIMIT',message:'知识融合请求过于频繁'}}}),async(req,res)=>{
  const body=z.object({scope:z.union([z.literal('all'),deviceId]),question:z.string().trim().min(2).max(1200),lang:z.enum(['zh','uz'])}).parse(req.body);
  const s=await store.read();if(s.aiUnavailable)throw new ApiError(503,'AI_UNAVAILABLE','DeepSeek 服务当前不可用');
  const profiles=await listCropProfiles();const profileMap=new Map(profiles.map(profile=>[profile.id,profile]));
  const selected=body.scope==='all'?s.devices:s.devices.filter(device=>device.id===body.scope);
  const active=s.tasks.filter(task=>task.type==='water'&&['pending','running'].includes(task.status));
  const warnings:string[]=[];const recommendations:KnowledgeContext['recommendations']=[];
  const zones:KnowledgeContext['zones']=selected.map(device=>{
   const profile=profileMap.get(device.cropId);if(!profile)throw new ApiError(409,'CROP_PROFILE_MISSING',`分区 ${device.id} 缺少作物参数`);
   const points=device.history.slice(-12);const delta=round(device.moisture-(points[0]?.value??device.moisture));const trend=delta<=-2?`下降 ${Math.abs(delta)}%`:delta>=2?`上升 ${delta}%`:'基本稳定';
   const irrigating=active.some(task=>task.results.some(result=>result.deviceId===device.id&&!['success','failed'].includes(result.status)));
   if(!device.online)warnings.push(`${device.id} 传感器离线，数据可能过期`);
   if(irrigating)warnings.push(`${device.id} 已有闭环灌溉任务执行中`);
   if(device.online&&device.moisture<profile.moisture.targetMin&&!irrigating){
    const last=s.tasks.find(task=>task.type==='water'&&task.results.some(result=>result.deviceId===device.id&&result.status==='success'));
    const minutes=last?(+new Date(s.clock)-+new Date(last.createdAt))/60000:Infinity;
    if(minutes<profile.irrigation.minIntervalMinutes)warnings.push(`${device.id} 尚未达到 ${profile.irrigation.minIntervalMinutes} 分钟最小灌溉间隔`);
    else recommendations.push({deviceId:device.id,crop:profile.nameZh,currentMoisture:round(device.moisture),targetMoisture:round((profile.moisture.targetMin+profile.moisture.targetMax)/2),maxVolume:profile.irrigation.maxVolume,reason:`当前湿度低于作物下限 ${profile.moisture.targetMin}%，近期趋势${trend}`});
   }
   return {id:device.id,crop:profile.nameZh,growthStage:device.growthStage,online:device.online,moisture:round(device.moisture),temperature:device.temperature,lightHours:device.light,trend,targetMoisture:`${profile.moisture.targetMin}-${profile.moisture.targetMax}%`,optimalTemperature:`${profile.temperature.optimalMin}-${profile.temperature.optimalMax}°C`,maxVolume:profile.irrigation.maxVolume,minIntervalMinutes:profile.irrigation.minIntervalMinutes,irrigating};
  });
  const context:KnowledgeContext={clock:s.clock,scope:body.scope,summary:{total:selected.length,online:selected.filter(device=>device.online).length,dry:zones.filter((zone,index)=>zone.online&&selected[index].moisture<(profileMap.get(selected[index].cropId)?.moisture.targetMin??0)).length,irrigating:zones.filter(zone=>zone.irrigating).length},zones,recommendations,warnings};
  const conversationId=`knowledge:${body.scope}`;const history=s.messages.filter(message=>message.deviceId===conversationId);const answer=await knowledgeReply(body.question,history,context,body.lang,ai,fetcher);
  const messages=await store.mutate(current=>{if(current.version!==s.version)throw new ApiError(409,'DEMO_RESET','数据已重置，请重新分析');const shared={deviceId:conversationId,at:current.clock,lang:body.lang,mode:'real' as const};const user:Message={...shared,id:crypto.randomUUID(),role:'user',content:body.question};const assistant:Message={...shared,id:crypto.randomUUID(),role:'assistant',content:answer};current.messages.push(user,assistant);current.messages=current.messages.slice(-300);return [user,assistant];});
  res.json({messages,analysis:{scope:body.scope,at:s.clock,model:ai.model,summary:context.summary,recommendations,warnings,sources:[{key:'sensor',label:'实时传感器数据',en:'Live sensor readings'},{key:'profile',label:'作物参数知识库',en:'Crop profile knowledge base'},{key:'history',label:'12 小时时序趋势',en:'12-hour time-series trend'},{key:'task',label:'灌溉任务与设备状态',en:'Irrigation and device state'}]}});
 });
 api.post('/forecasts',async(req,res)=>{
  const b=z.object({deviceId,temperature:z.number().min(18).max(36),light:z.number().min(0).max(12)}).parse(req.body);
  res.json(await store.mutate(s=>{const result=forecast(s.devices.find(d=>d.id===b.deviceId)!,b.temperature,b.light,s.clock);s.forecasts.push(result);s.forecasts=s.forecasts.slice(-100);return result;}));
 });
 api.get('/forecasts/:id/latest',async(req,res)=>{const s=await store.read();res.json([...s.forecasts].reverse().find(f=>f.deviceId===req.params.id)||null);});
 api.get('/tasks',async(_req,res)=>res.json((await store.read()).tasks));
 api.post('/tasks/:id/stop',async(req,res)=>res.json(await store.mutate(s=>{const task=s.tasks.find(item=>item.id===req.params.id);if(!task)throw new ApiError(404,'TASK_NOT_FOUND','灌溉任务不存在');if(!['pending','running'].includes(task.status))throw new ApiError(409,'TASK_FINISHED','灌溉任务已经结束');task.status='failed';for(const result of task.results){if(['pending','running'].includes(result.status)){result.status='failed';result.message='MANUAL_STOP';result.at=s.clock;}}return task;})));
 api.post('/tasks',async(req,res)=>{
  const b=z.object({deviceIds:z.array(deviceId).min(1).max(16),type:z.enum(['check','water']),volume:z.number().min(10).max(300).optional(),requestId:z.string().uuid(),version:z.number().int()}).parse(req.body);
  const profileMap=new Map((await listCropProfiles()).map(profile=>[profile.id,profile]));
  res.status(201).json(await store.mutate(s=>{
   if(s.version!==b.version)throw new ApiError(409,'DEMO_RESET','演示数据已重置，请刷新后操作');
   const ids=[...new Set(b.deviceIds)];const old=s.tasks.find(t=>t.requestId===b.requestId);
   if(old){if(old.type!==b.type||[...old.results.map(r=>r.deviceId)].sort().join()!==[...ids].sort().join())throw new ApiError(409,'REQUEST_CONFLICT','同一请求编号不能用于不同任务');return old;}
   if(s.tasks.some(t=>['pending','running'].includes(t.status)&&t.results.some(r=>ids.includes(r.deviceId as typeof ids[number]))))throw new ApiError(409,'DEVICE_BUSY','设备已有执行中的任务');
   if(ids.some(id=>!s.devices.find(d=>d.id===id)!.online))throw new ApiError(409,'DEVICE_OFFLINE','离线设备不可创建任务');
   const results=ids.map(deviceId=>{const device=s.devices.find(d=>d.id===deviceId)!;const profile=profileMap.get(device.cropId);if(!profile)throw new ApiError(409,'CROP_PROFILE_MISSING',`分区 ${deviceId} 缺少作物参数`);const target=round((profile.moisture.targetMin+profile.moisture.targetMax)/2);if(b.type==='water'&&device.moisture>=profile.moisture.targetMin)throw new ApiError(409,'MOISTURE_ALREADY_SUITABLE',`分区 ${deviceId} 已达到适宜湿度，无需灌溉`);const last=[...s.tasks].find(task=>task.type==='water'&&task.results.some(result=>result.deviceId===deviceId&&result.status==='success'));if(b.type==='water'&&last&&(+new Date(s.clock)-+new Date(last.createdAt))/60000<profile.irrigation.minIntervalMinutes)throw new ApiError(409,'IRRIGATION_INTERVAL',`分区 ${deviceId} 尚未达到最短灌溉间隔`);return {deviceId,status:'pending' as const,progress:0,delivered:0,message:'PENDING',at:s.clock,initialMoisture:device.moisture,targetMoisture:target,maxVolume:b.type==='water'?profile.irrigation.maxVolume:0,elapsedSeconds:0,maxDurationSeconds:b.type==='water'?Math.ceil(profile.irrigation.maxVolume/10)+5:5};});
   const t:Task={id:crypto.randomUUID(),requestId:b.requestId,type:b.type,volume:b.type==='water'?Math.max(...results.map(result=>result.maxVolume)):0,createdAt:s.clock,status:'pending',results};
   s.tasks.unshift(t);s.tasks=s.tasks.slice(0,200);return t;
  }));
 });
 api.post('/simulation/control',async(req,res)=>{
  const b=z.object({action:z.enum(['dry','offline','online','ai-off','ai-on','pause','resume','reset','insufficient']),deviceId:deviceId.optional(),confirm:z.literal('RESET_DEMO').optional()}).parse(req.body);
  if(['dry','offline','online','insufficient'].includes(b.action)&&!b.deviceId)throw new ApiError(400,'VALIDATION','请选择目标设备');
  if(b.action==='reset'&&b.confirm!=='RESET_DEMO')throw new ApiError(400,'CONFIRM_REQUIRED','重置需要明确确认');
  await store.mutate(s=>{
   if(b.action==='reset'){const fresh=seed();fresh.version=s.version+1;Object.assign(s,fresh);return;}
   if(b.action==='pause')s.paused=true;if(b.action==='resume')s.paused=false;
   if(b.action==='ai-off')s.aiUnavailable=true;if(b.action==='ai-on')s.aiUnavailable=false;
   const d=s.devices.find(d=>d.id===b.deviceId);
   if(d){
    if(b.action==='offline'){d.online=false;for(const t of s.tasks){for(const r of t.results){if(r.deviceId===d.id&&['pending','running'].includes(r.status)){r.status='failed';r.message='DEVICE_OFFLINE';r.at=s.clock;}}if(t.results.every(r=>['success','failed'].includes(r.status)))t.status=t.results.some(r=>r.status==='failed')?'failed':'success';}}
    if(b.action==='online'){d.online=true;d.lastSeen=s.clock;d.history.push({at:s.clock,value:d.moisture});}
    if(b.action==='dry'){d.moisture=20;if(d.online){d.lastSeen=s.clock;d.history.push({at:s.clock,value:20});}}
    if(b.action==='insufficient')d.history=d.history.slice(-1);
   }
  });res.json({ok:true});
 });
 app.use('/api',api);app.use('/api',(_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'接口不存在'}}));
 app.use(express.static(path.resolve('dist/client')));app.get('/{*path}',(_req,res)=>res.sendFile(path.resolve('dist/client/index.html')));
 app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  if(err instanceof ZodError){res.status(400).json({error:{code:'VALIDATION',message:'输入参数无效',details:err.issues.map(i=>i.path.join('.'))}});return;}
  if(err instanceof ApiError){res.status(err.status).json({error:{code:err.code,message:err.message}});return;}
  if(err instanceof SyntaxError){res.status(400).json({error:{code:'VALIDATION',message:'JSON格式无效'}});return;}
  console.error('Request failed:',err instanceof Error?err.message:'unknown error');res.status(500).json({error:{code:'INTERNAL',message:'服务异常，请稍后重试'}});
 });return app;
}
