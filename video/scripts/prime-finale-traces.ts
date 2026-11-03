import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {compile, evaluateFunction, latex} from '../../src/compiler/compiler';
import {renderedEquation} from './math-svg';
import {basicCleanup} from './basic-cleanup';
const dir = 'video/examples/prime-finale';
mkdirSync(dir,{recursive:true}); mkdirSync('video/src/prime-finale',{recursive:true});
const domain = `fn f(real x ? x > 0)
    = x
    >> ln
end
`;
const prime = `aux fn isPrime(int m ? m >= 2)
    = prod d from 2 to m-1 (
        define remainder m % d
        = 0 ? (remainder == 0) else 1
    )
end
`;
const counter = `fn primeCount(int n ? n >= 0)
    = sum m from 2 to n (
        = 0
        += 1 ? (isPrime(m) == 1)
    )
end
`;
writeFileSync(`${dir}/domain.aal`,domain);
writeFileSync(`${dir}/prime-counter.aal`,prime+'\n'+counter);
type Feature={line:number;token:string;kind?:string;note?:string;tex?:string};
type Stage={line:number;program:string;label?:string;features?:Feature[]};
const P=(body:string)=>`aux fn isPrime(int m ? m >= 2)\n${body}\nend`;
const C=(body:string)=>prime+`\nfn primeCount(int n ? n >= 0)\n${body}\nend`;
const inProduct=(body:string)=>P(`= prod d from 2 to m-1 (\n${body}\n)`);
const inSum=(body:string)=>C(`= sum m from 2 to n (\n${body}\n)`);
const examples=[{
 slug:'domain',source:domain,full:domain,skip:false,stages:[
  {line:1,program:'fn f(real x ? x > 0) = 0\nend',features:[
   {line:1,token:'real',kind:'domain',note:'First choose the input type.'},
   {line:1,token:'? x > 0',tex:String.raw`\begin{gathered}x\in\mathbb{R},\quad x>0\\[0.5em]x=2\;\checkmark\qquad x=0\;\times\qquad x=-1\;\times\end{gathered}`,note:'A requirement on the input, before the function runs.'}]},
  {line:2,program:'fn f(real x ? x > 0) = x\nend'},
  {line:3,program:domain}],
 },{
 slug:'prime-test',source:prime,full:prime,skip:true,stages:[
  {line:1,program:P('= 0'),features:[{line:1,token:'int m ? m >= 2',kind:'domain',note:'Test integers starting at 2.'}]},
  {line:2,program:inProduct('= 1'),features:[{line:2,token:'prod d from 2 to m-1',tex:String.raw`\begin{gathered}d=2,3,\ldots,m-1\\[0.6em]m=2:\quad\prod_{d=2}^{1}1=1\end{gathered}`,note:'Try the possible divisors. An empty product is 1.'}]},
  {line:3,program:inProduct('= 1'),features:[{line:3,token:'m % d',tex:String.raw`\begin{gathered}6\bmod2=0\\[0.4em]7\bmod2=1\end{gathered}`,note:'A remainder of zero means d divides m.'}]},
  {line:4,program:prime,features:[{line:4,token:'? (remainder == 0) else 1',tex:String.raw`\begin{gathered}d\mid m\ \Rightarrow\ 0\\d\nmid m\ \Rightarrow\ 1\\[0.5em]0\cdot\text{anything}=0\end{gathered}`,note:'One divisor makes the product zero. Otherwise it stays 1.'}]},
  {line:5,program:prime}],
 },{
 slug:'prime-count',source:counter,full:prime+'\n'+counter,skip:true,stages:[
  {line:1,program:C('= 0')},
  {line:2,program:inSum('= 0')},
  {line:3,program:inSum('= 0')},
  {line:4,program:prime+'\n'+counter,features:[{line:4,token:'+= 1',tex:String.raw`\begin{gathered}\operatorname{isPrime}(m)=1\ \Rightarrow\ +1\\[0.5em]\operatorname{isPrime}(m)=0\ \Rightarrow\ +0\end{gathered}`,note:'Count one for each prime, and nothing for the others.'}]},
  {line:5,program:prime+'\n'+counter}],
 }];
for(const e of examples){
 const full=compile(e.full), signature=`\\operatorname{${full.name}}(${full.params.join(',')})`;
 let previous=compile(e.stages[0].program).ir;
 const steps=e.stages.map((stage:Stage)=>{
  const result=compile(stage.program), body=latex(result.ir), label=stage.label??signature;
  const spotlights=(stage.features??[]).map(feature=>({...feature,kind:feature.kind??'visual',...renderedEquation(feature.tex??`${label}=${body}`)}));
  const step={kind:'update',line:stage.line,endLine:stage.line,source:e.source.split('\n')[stage.line-1],title:'',before:previous,after:result.ir,beforeLatex:latex(previous),afterLatex:body,mathLabel:label,...renderedEquation(`${label}=${body}`),spotlights};
  previous=result.ir;return step;
 });
 const cleaned=e.slug==='domain'?basicCleanup(full.ir):full.simplified;
 const endLine=e.source.trimEnd().split('\n').length;
 for(const [kind,expr]of [['update',full.ir],['simplify',cleaned]]as const)steps.push({...steps.at(-1)!,kind,line:endLine,endLine,spotlights:[],after:expr,afterLatex:latex(expr),mathLabel:signature,...renderedEquation(`${signature}=${latex(expr)}`)});
 const aux=e.slug==='prime-count'?[renderedEquation(String.raw`\begin{gathered}\text{for } ${full.domainLatex}\\[0.8em]\operatorname{isPrime}(m)=${latex(compile(prime).simplified)}\\[0.4em]\text{for } ${compile(prime).domainLatex}\end{gathered}`)]:undefined;
 writeFileSync(`video/src/prime-finale/${e.slug}.json`,JSON.stringify({source:e.source,name:full.name,params:full.params,domainLatex:full.domainLatex,finalLatex:latex(cleaned),steps,
 introMath:renderedEquation(`${signature}=${latex(full.ir)}`),showCaptions:false,hideDomain:e.slug==='prime-count',tutorialTitle:true,skipFormulaIntro:e.skip,
 auxiliaryMath:aux,auxiliaryFromLine:1,timing:{line:1,intro:0.4,outro:2}},null,2)+'\n');
 writeFileSync(`video/src/prime-finale/${e.slug}.tsx`,`import {createWalkthrough} from '../scenes/walkthrough';\nimport trace from './${e.slug}.json';\nexport default createWalkthrough(trace);\n`);
}
const compiled=compile(prime+'\n'+counter);
for(let n=0;n<=100;n++){
 let expected=0;
 for(let m=2;m<=n;m++){let valid=true;for(let d=2;d*d<=m;d++)if(m%d===0){valid=false;break;}if(valid)expected++;}
 const actual=evaluateFunction(compiled,{n});if(actual!==expected)throw Error(`primeCount(${n}): ${actual} != ${expected}`);
}
for(const x of [0,-1]){let rejected=false;try{evaluateFunction(compile(domain),{x});}catch{rejected=true;}if(!rejected)throw Error('Domain accepted invalid input');}
if(Math.abs(evaluateFunction(compile(domain),{x:Math.E})-1)>1e-12)throw Error('Domain example failed');
const resultAssets=[10,25,100].map(n=>({...renderedEquation(`\\operatorname{primeCount}(${n})=${evaluateFunction(compiled,{n})}`)}));
writeFileSync('video/src/prime-finale/results.json',JSON.stringify(resultAssets,null,2));
console.log('Prime counter checked against trial division for every n from 0 through 100; domain checks passed.');
