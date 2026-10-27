/** Editorial product policy. Facts and applied recommendations are supplied by the application. */
export const WORKOUT_FEEDBACK_VERSION='WORKOUT-FEEDBACK/2.1.0';
export const WORKOUT_FEEDBACK={
  progress:['Dina genomförda pass ger stöd för ett nytt steg. Snyggt arbete.', 'Bra jobbat. Det finns nu underlag för att prova nästa steg.', 'Dagens arbete är sparat. Du har gett nästa förslag mer att bygga på.'],
  complete:['Dagens plan är genomförd. Bra jobbat med passet.', 'Du genomförde dagens planerade arbete. Fint jobbat.', 'Passet är klart och dina set är sparade. En bra utgångspunkt för fortsättningen.'],
  adjusted:['Dagens genomförda dos är sparad och får vara underlag framåt. Bra jobbat med passet.', 'Passet blev ditt genomförda arbete. Det är den dosen nästa beräkning får utgå från.', 'Dina registrerade vikter, repetitioner och set finns med i underlaget. Fint arbete idag.'],
  demanding:['Du markerade flera set som ansträngande. Dina svar finns med i underlaget framåt.', 'Det blev flera ansträngande set enligt dina svar. Passet är sparat; ge återhämtningen utrymme.', 'Dagens arbete och hur det kändes är sparat. Nu får passet landa.'],
  substituted:['Du bytte övning och fick träning gjord. Dina genomförda set är sparade.', 'Övningsbytet och dagens arbete finns i historiken. Bra jobbat med passet.', 'En annan övning, nya registrerade set. Det ger mer eget underlag framåt.'],
  partial:['Det du genomförde är sparat. Ett kortare pass har också en plats i träningsdagboken.', 'Dina genomförda set räknas in i nästa beräkning. Det du hann göra räknas.', 'Passet blev kortare och ditt arbete finns kvar. Fortsätt när det passar.'],
  returning:['Välkommen tillbaka. Dagens arbete är sparat. Ett pass i taget.', 'Du är igång igen. Dagens set ger nytt underlag för fortsättningen.', 'Första passet efter uppehållet finns i träningsdagboken. Välkommen tillbaka.'],
  general:['Dagens träning är sparad. Bra jobbat.', 'Dina genomförda set ger mer underlag framåt. Fint arbete idag.', 'Ett pass till finns i träningsdagboken. Bra jobbat med dagens träning.'],
  extra:['Dina extra arbetsset är sparade och räknas med i kommande beräkningar.', 'Passet fick extra arbete. Dina genomförda set finns med i underlaget.', 'Även dina tillagda arbetsset är sparade. Bra jobbat med dagens pass.'],
  first:['En ny övning har fått egna registrerade arbetsset. Bra början.', 'Första resultatet i en ny övning är sparat. Nästa förslag får mer att gå på.', 'Nu finns egna prestationer för en ny övning. Fint arbete idag.'],
  maintained:['Du upprepade en tidigare registrerad nivå. Stabilt arbete att bygga vidare på.', 'Samma nivå finns registrerad igen. Bra jobbat med dagens pass.', 'Du genomförde den tidigare nivån igen. Det ger mer underlag för fortsättningen.'],
  protected:['Ditt genomförda arbete är sparat. Dina aktuella begränsningar gäller också framåt.', 'Passet är sparat. Kommande förslag tar hänsyn till dina registrerade begränsningar.'],
  trial_return:['Försöket är registrerat. Nästa förslag utgår från en tidigare genomförd nivå.', 'Dagens försök ger mer information. Nu utgår förslaget från den nivå du redan har genomfört.'],
  empty:['Passet är avslutat utan registrerade arbetsset. Planen finns kvar till nästa gång.'],
} as const;
export type FeedbackCategory=keyof typeof WORKOUT_FEEDBACK;
export type FeedbackFacts={extra?:boolean;first?:boolean;maintained?:boolean;protected?:boolean;trialReturn?:boolean;performed:number;complete:boolean;improved:boolean;adjusted:boolean;demanding:boolean;substituted:boolean;returning:boolean;partial:boolean};
export function feedbackCategory(f:FeedbackFacts):FeedbackCategory {
  if(!f.performed)return 'empty';
  if(f.protected)return 'protected';
  if(f.trialReturn)return 'trial_return';
  if(f.adjusted)return 'adjusted';
  if(f.partial)return 'partial';
  if(f.demanding)return 'demanding';
  if(f.returning)return 'returning';
  if(f.improved)return 'progress';
  if(f.extra)return 'extra';
  if(f.first)return 'first';
  if(f.maintained)return 'maintained';
  if(f.substituted)return 'substituted';
  return f.complete?'complete':'general';
}
/** Legacy pure selection API retained for callers; the saved variant uses template ids. */
export function chooseFeedback(category:FeedbackCategory,recent:string[],seed:number):string {
  const choices=WORKOUT_FEEDBACK[category],fresh=choices.filter(t=>!recent.includes(t));
  const pool=fresh.length?fresh:choices;return pool[Math.abs(Math.trunc(seed))%pool.length];
}
export type FeedbackChoice={version:string;sessionId:string;at:string;category:FeedbackCategory;templateId:string;humorId?:string};
const HUMOR={small_steps:'Små steg räknas. Även utan trumvirvel.', diary:'Träningsdagboken har fått en rad till. Den är lätt att bära hem.'} as const;
export function selectFeedback(a:{sessionId:string;at:string;category:FeedbackCategory;seed:number;recent:FeedbackChoice[];existing?:FeedbackChoice;allowHumor:boolean}):{choice:FeedbackChoice;text:string} {
  const variants=WORKOUT_FEEDBACK[a.category].map((text,index)=>({text,id:`${a.category}:${index}`}));
  const prior=a.existing?.version===WORKOUT_FEEDBACK_VERSION&&a.existing.category===a.category?variants.find(v=>v.id===a.existing!.templateId):undefined;
  const fresh=variants.filter(v=>!a.recent.slice(0,10).some(r=>r.templateId===v.id));
  const avoidLast=variants.filter(v=>v.id!==a.recent[0]?.templateId);
  const pool=fresh.length?fresh:avoidLast.length?avoidLast:variants;
  const selected=prior??pool[Math.abs(a.seed)%pool.length];
  const eligibleCategories=['progress','complete','maintained','general','first'];
  const eligible=eligibleCategories.includes(a.category);
  const eligibleRecent=a.recent.filter(r=>eligibleCategories.includes(r.category));
  const safeHumor=a.allowHumor&&eligible;
  const retainedHumor=prior&&safeHumor?a.existing?.humorId:undefined;
  const mayAdd=!prior&&safeHumor&&eligibleRecent.length>=2&&eligibleRecent.slice(0,2).every(r=>!r.humorId)&&a.seed%3===0;
  const availableHumor=(a.category==='progress'?['small_steps','diary']:['diary','small_steps']).filter(id=>!a.recent.slice(0,10).some(r=>r.humorId===id));
  const humorId=retainedHumor??(mayAdd?availableHumor[0]:undefined);
  const choice:FeedbackChoice={version:WORKOUT_FEEDBACK_VERSION,sessionId:a.sessionId,at:a.at,category:a.category,templateId:selected.id,...(humorId?{humorId}:{})};
  return {choice,text:selected.text+(humorId&&humorId in HUMOR?' '+HUMOR[humorId as keyof typeof HUMOR]:'')};
}
