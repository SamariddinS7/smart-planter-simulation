<script setup lang="ts">
import { ref,onMounted,onBeforeUnmount,watch } from 'vue';
import * as echarts from 'echarts';
import type {Forecast} from '../../server/domain';
const props=defineProps<{data:Forecast;lang:string;comparison:boolean}>();
const root=ref<HTMLElement>();let chart:echarts.ECharts|undefined;let observer:ResizeObserver;
function render(){if(!chart)return;const f=props.data,zh=props.lang==='zh';const now=+new Date(f.at);const history=f.history.map(p=>[(+new Date(p.at)-now)/3600000,p.value]);
 chart.setOption({animation:false,grid:{left:38,right:16,top:22,bottom:42},tooltip:{trigger:'axis',valueFormatter:(v:any)=>`${Number(v).toFixed(1)}%`},xAxis:{type:'value',min:-24,max:12,interval:12,axisLine:{lineStyle:{color:'#dbe3db'}},splitLine:{show:false},axisLabel:{color:'#687c73',fontSize:11,formatter:(v:number)=>v===0?(zh?'现在':'Now'):`${v>0?'+':''}${v}h`}},yAxis:{type:'value',min:0,max:100,interval:25,axisLabel:{formatter:'{value}%',color:'#687c73',fontSize:10},splitLine:{lineStyle:{color:'#eef1eb'}}},series:[
 {name:zh?'历史':'History',type:'line',data:history,showSymbol:false,lineStyle:{color:'#08704e',width:3},itemStyle:{color:'#08704e'}},
 {name:zh?'情景下界':'Scenario low',type:'line',data:f.future.map(p=>[p.hours,p.low]),showSymbol:false,lineStyle:{color:'#bdcebb',type:'dotted',width:1},itemStyle:{color:'#bdcebb'}},
 {name:zh?'情景上界':'Scenario high',type:'line',data:f.future.map(p=>[p.hours,p.high]),showSymbol:false,lineStyle:{color:'#bdcebb',type:'dotted',width:1},itemStyle:{color:'#bdcebb'}},
 {name:zh?'预测':'Forecast',type:'line',data:f.future.map(p=>[p.hours,p.value]),showSymbol:false,lineStyle:{color:'#08704e',type:'dashed',width:3},itemStyle:{color:'#08704e'},markLine:{symbol:'none',silent:true,label:{formatter:zh?'提醒线 25%':'Alert 25%',position:'insideEndTop',color:'#b77818',fontSize:10},lineStyle:{color:'#d69634'},data:[{yAxis:25}]}},
 {name:zh?'基线':'Baseline',type:'line',data:props.comparison?f.future.map(p=>[p.hours,p.baseline]):[],showSymbol:false,lineStyle:{color:'#8a8bb6',width:2,type:'dashed'},itemStyle:{color:'#8a8bb6'}}
 ]},true);
}
onMounted(()=>{chart=echarts.init(root.value!);observer=new ResizeObserver(()=>chart?.resize());observer.observe(root.value!);render();});
watch(()=>[props.data,props.lang,props.comparison],render,{deep:true});onBeforeUnmount(()=>{observer?.disconnect();chart?.dispose();});
</script>
<template><div ref="root" class="chart" role="img" :aria-label="lang==='zh'?'过去24小时湿度与未来12小时模拟趋势':'Past 24 hours and future 12 hours of simulated relative moisture'"></div></template>
