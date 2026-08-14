import type{Config,Line,MediaFormat,Strategy}from"./types";
export const objectiveWeights:Record<string,Strategy>={"Generar ventas":{awareness:10,consideration:20,performance:70},"Captar clientes nuevos":{awareness:35,consideration:35,performance:30},"Incrementar frecuencia":{awareness:20,consideration:30,performance:50},"Aumentar consideración":{awareness:30,consideration:60,performance:10},"Lanzamiento de producto":{awareness:60,consideration:30,performance:10},"Defender share":{awareness:40,consideration:30,performance:30}};
export const score=(f:MediaFormat,w:Strategy)=>f.weights.aw*w.awareness/100+f.weights.co*w.consideration/100+f.weights.pe*w.performance/100;
const presentation=(f:MediaFormat)=>["Search","Shopping","PMAX"].includes(f.detail)?"Google":f.detail==="Facebook Tráfico"?"Meta":f.detail;
const rationale=(n:string)=>n==="Google"?"Presupuesto agrupado para que la agencia optimice Search, Shopping y PMAX.":n==="Meta"?"Presupuesto social agrupado para optimización táctica de agencia.":n.includes("Sponsored")?"Visibilidad onsite cercana al momento de compra.":n;
export function buildPlan(config:Config,total:number,w:Strategy):Line[]{
 const eligible=config.formats.filter(f=>f.min===null||f.min<=total).map(f=>({...f,s:score(f,w)})).sort((a,b)=>b.s-a.s);
 const crm=eligible.filter(f=>f.layer==="CRM / Mensajería").find(f=>f.min!==null)||eligible.find(f=>f.layer==="CRM / Mensajería");
 const selected=[...(crm?[crm]:[]),...eligible.filter(f=>f!==crm&&f.layer!=="CRM / Mensajería").slice(0,4)];
 const crmBudget=crm?(crm.min??0):0;const rest=Math.max(0,total-crmBudget);const non=selected.filter(f=>f!==crm);const sum=non.reduce((a,f)=>a+f.s,0)||1;
 const raw:Line[]=selected.map(f=>({displayName:presentation(f),sourceKeys:[f.key],budget:f===crm?crmBudget:Math.round(rest*f.s/sum/1000)*1000,score:f.s,layer:f.layer,mandatory:f===crm,requiresPricing:f.min===null,rationale:f===crm?`CRM obligatorio: ${f.detail}.`:rationale(presentation(f))}));
 const merged=new Map<string,Line>();for(const l of raw){const old=merged.get(l.displayName);if(old){old.budget+=l.budget;old.sourceKeys.push(...l.sourceKeys);old.score=Math.max(old.score,l.score)}else merged.set(l.displayName,{...l})}
 const lines=[...merged.values()];const diff=total-lines.reduce((a,l)=>a+l.budget,0);if(lines.length)lines[lines.length-1].budget+=diff;return lines;
}