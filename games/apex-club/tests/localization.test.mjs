import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../localization.js',import.meta.url),'utf8').replaceAll('export ','');
function load(saved,{blocked=false}={}){let stored=saved;const context=vm.createContext({navigator:{language:'zh-CN'},localStorage:{getItem(){if(blocked)throw Error('blocked');return stored;},setItem(k,v){if(blocked)throw Error('blocked');stored=v;}}});vm.runInContext(source+'\nglobalThis.api={getLanguage,setLanguage,tr,englishSource};',context);return {api:context.api,saved:()=>stored};}
test('first visit defaults to English even when browser language is Chinese',()=>{assert.equal(load(null).api.getLanguage(),'en');assert.equal(load('invalid').api.getLanguage(),'en');assert.equal(load('zh').api.getLanguage(),'zh');});
test('language selection persists and translates both static and dynamic labels',()=>{const {api,saved}=load(null);api.setLanguage('zh');assert.equal(saved(),'zh');assert.equal(api.tr('Garage'),'车库');assert.equal(api.tr('EMP: 3 TARGETS'),'EMP：3 位对手在范围内');assert.equal(api.englishSource(api.tr('EMP: 3 TARGETS')),'EMP: 3 TARGETS');api.setLanguage('en');assert.equal(api.tr('Garage'),'Garage');assert.equal(saved(),'en');});
test('blocked storage still allows switching in the current session',()=>{const {api}=load(null,{blocked:true});api.setLanguage('zh');assert.equal(api.tr('Paint'),'车漆');api.setLanguage('en');assert.equal(api.getLanguage(),'en');});
test('a change from another tab updates language without writing it back',()=>{const {api,saved}=load('en');api.setLanguage('zh',{persist:false});assert.equal(api.getLanguage(),'zh');assert.equal(saved(),'en');});
