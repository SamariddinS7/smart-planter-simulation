import mongoose from 'mongoose';
import {ApiError,type CropProfile} from './domain.js';

const rangeSchema=new mongoose.Schema({min:{type:Number,required:true},max:{type:Number,required:true}},{_id:false});
const CropProfileModel=mongoose.models.CropProfile||mongoose.model('CropProfile',new mongoose.Schema({
 id:{type:String,required:true,unique:true,match:/^[a-z0-9-]+$/},nameZh:{type:String,required:true},nameUz:{type:String,required:true},nameEn:{type:String,required:true},category:{type:String,required:true},
 temperature:{min:{type:Number,required:true},optimalMin:{type:Number,required:true},optimalMax:{type:Number,required:true},max:{type:Number,required:true}},
 moisture:{critical:{type:Number,required:true},targetMin:{type:Number,required:true},targetMax:{type:Number,required:true},max:{type:Number,required:true}},
 lightHours:rangeSchema,irrigation:{maxVolume:{type:Number,required:true},minIntervalMinutes:{type:Number,required:true}},version:{type:Number,required:true},updatedAt:{type:String,required:true}
},{versionKey:false}));

type ProfileInput=Omit<CropProfile,'version'|'updatedAt'>;
const profile=(id:string,nameZh:string,nameUz:string,nameEn:string,category:string,temp:[number,number,number,number],moisture:[number,number,number,number],light:[number,number],volume=80,interval=120):ProfileInput=>({
 id,nameZh,nameUz,nameEn,category,
 temperature:{min:temp[0],optimalMin:temp[1],optimalMax:temp[2],max:temp[3]},
 moisture:{critical:moisture[0],targetMin:moisture[1],targetMax:moisture[2],max:moisture[3]},
 lightHours:{min:light[0],max:light[1]},irrigation:{maxVolume:volume,minIntervalMinutes:interval}
});

export const defaultCropProfiles:ProfileInput[]=[
 profile('lettuce','生菜','Salat','Lettuce','叶菜 / Leafy green',[5,15,24,30],[35,55,75,85],[10,14],70,90),
 profile('tomato','番茄','Pomidor','Tomato','茄果 / Solanaceae',[10,18,28,35],[35,55,75,85],[12,16],90,120),
 profile('cucumber','黄瓜','Bodring','Cucumber','瓜类 / Cucurbit',[12,20,30,35],[40,60,80,90],[10,14],100,120),
 profile('strawberry','草莓','Qulupnay','Strawberry','浆果 / Berry',[5,15,26,32],[40,60,80,90],[10,14],70,120),
 profile('pepper','辣椒','Qalampir','Pepper','茄果 / Solanaceae',[12,18,30,35],[35,55,75,85],[12,16],85,120),
 profile('basil','罗勒','Rayhon','Basil','香草 / Herb',[10,18,30,35],[35,55,75,85],[10,14],65,90),
 profile('eggplant','茄子','Baqlajon','Eggplant','茄果 / Solanaceae',[12,20,30,36],[35,55,75,85],[12,16],90,120),
 profile('bok-choy','小白菜','Pak-choy','Bok choy','叶菜 / Leafy green',[5,15,25,32],[40,60,80,90],[10,14],70,90),
 profile('broccoli','西兰花','Brokkoli','Broccoli','十字花科 / Brassica',[3,15,24,30],[40,60,80,90],[10,14],80,120),
 profile('melon','甜瓜','Qovun','Melon','瓜类 / Cucurbit',[12,20,32,38],[30,50,70,80],[12,16],100,150),
 profile('coriander','香菜','Kashnich','Coriander','香草 / Herb',[5,15,25,32],[35,55,75,85],[10,14],60,90),
 profile('spinach','菠菜','Ismaloq','Spinach','叶菜 / Leafy green',[2,10,24,30],[40,60,80,90],[10,14],70,90),
 profile('celery','芹菜','Selderey','Celery','叶柄菜 / Stalk vegetable',[5,15,25,32],[45,65,85,92],[10,14],80,90),
 profile('corn','玉米','Makkajo‘xori','Corn','谷物 / Cereal',[10,18,30,38],[35,50,70,82],[12,16],90,120),
 profile('green-onion','香葱','Ko‘k piyoz','Green onion','葱蒜类 / Allium',[5,15,26,34],[38,55,75,86],[10,14],70,90)
];

const clean=(doc:any):CropProfile=>{const value=doc.toObject?doc.toObject():doc;delete value._id;return value as CropProfile;};
export async function ensureCropProfiles(){const updatedAt=new Date().toISOString();await Promise.all(defaultCropProfiles.map(item=>CropProfileModel.updateOne({id:item.id},{$setOnInsert:{...item,version:1,updatedAt}},{upsert:true})));}
export async function listCropProfiles():Promise<CropProfile[]>{return (await CropProfileModel.find().sort({nameEn:1}).lean()).map(clean);}
export async function createCropProfile(input:ProfileInput):Promise<CropProfile>{if(await CropProfileModel.exists({id:input.id}))throw new ApiError(409,'CROP_EXISTS','作物编号已存在');return clean(await CropProfileModel.create({...input,version:1,updatedAt:new Date().toISOString()}));}
export async function updateCropProfile(id:string,input:ProfileInput):Promise<CropProfile>{if(id!==input.id)throw new ApiError(400,'CROP_ID_IMMUTABLE','作物编号不可修改');const current=await CropProfileModel.findOne({id});if(!current)throw new ApiError(404,'CROP_NOT_FOUND','作物参数不存在');current.set({...input,version:Number(current.get('version'))+1,updatedAt:new Date().toISOString()});await current.save();return clean(current);}
export async function deleteCropProfile(id:string){const result=await CropProfileModel.deleteOne({id});if(!result.deletedCount)throw new ApiError(404,'CROP_NOT_FOUND','作物参数不存在');}
