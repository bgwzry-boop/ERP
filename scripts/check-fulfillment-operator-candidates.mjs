import assert from 'node:assert/strict';
import { createRuntimeSession } from '../server/authSeed.mjs';
import { createApiServer } from '../server/apiServer.mjs';
import { listFulfillmentOperatorCandidates } from '../server/services/fulfillmentOperatorCandidatesService.mjs';
import { listenTestServer, closeTestServer, getTestServerBaseUrl } from './helpers/apiIntegrationTestHarness.mjs';
import { withLocalRepositoryFixture } from './helpers/localRepositoryFixture.mjs';
const employees = [
  {id:'E-CAND-1',name:'在岗司机',userId:'U-CAND-1',profileStatus:'account_enabled'},
  {id:'E-CAND-2',name:'停用司机',userId:'U-CAND-2',profileStatus:'account_enabled',loginEnabled:true,accountEnabled:true},
  {id:'E-CAND-3',name:'已离职司机',userId:'U-CAND-3',profileStatus:'departed'},
  {id:'E-CAND-4',name:'档案称司机',userId:'U-CAND-4',roleName:'司机',profileStatus:'account_enabled'},
  {id:'E-CAND-5',name:'无账号搬货员工',profileStatus:'pending_admin_review'},
];
const users = employees.filter(row=>row.userId).map(row=>({userId:row.userId,employeeId:row.id,loginName:row.userId,displayName:row.name,enabled:row.id!=='E-CAND-2',loginEnabled:row.id!=='E-CAND-2',roles:row.id==='E-CAND-4'?['office']:['driver'],defaultRole:row.id==='E-CAND-4'?'office':'driver'}));
const fixture={employees,users};
assert.deepEqual(listFulfillmentOperatorCandidates({workspace:fixture,actionPermissions:['fulfillment.dispatch.update']}),{drivers:[{userId:'U-CAND-1',name:'在岗司机'}]});
const warehouse=listFulfillmentOperatorCandidates({workspace:fixture,actionPermissions:['fulfillment.warehouse.execute']});
assert.equal(warehouse.warehouseExecutors.some(row=>row.employeeId==='E-CAND-3'),false);
assert.equal(warehouse.warehouseExecutors.some(row=>row.employeeId==='E-CAND-5'),true);
assert.equal(Object.hasOwn(warehouse,'drivers'),false);
const server=createApiServer(withLocalRepositoryFixture({allowLocalFixture:true,runtimeIdentityRepository:{kind:'local_json',loadState:async()=>({users,employeeAccounts:employees}),ensureSeedUserReferences:async()=>({insertedCount:0}),saveState:async()=>({})}}));
await server.ready;await listenTestServer(server);
try {
 const base=getTestServerBaseUrl(server);
 async function read(operator,path='/api/fulfillments/operator-candidates') {const response=await fetch(base+path,{headers:{'x-erp-user-id':operator}});return {status:response.status,body:await response.json()};}
 const office=await read('U-OFFICE-A');assert.equal(office.status,200);assert.deepEqual(office.body.drivers,[{userId:'U-CAND-1',name:'在岗司机'}]);assert.ok(office.body.warehouseExecutors.some(row=>row.employeeId==='E-CAND-5'));
 const warehouseResponse=await read('U-WAREHOUSE-A');assert.equal(warehouseResponse.status,200);assert.ok(Array.isArray(warehouseResponse.body.warehouseExecutors));assert.equal(Object.hasOwn(warehouseResponse.body,'drivers'),false);
 for (const user of ['U-DRIVER-A','U-FINANCE-A']) { const result=await read(user);assert.equal(result.status,403);assert.equal(result.body.drivers,undefined);assert.equal(result.body.warehouseExecutors,undefined); }
 for (const user of ['U-OFFICE-A','U-WAREHOUSE-A']) assert.equal((await read(user,'/api/master-data/employee-account-reviews')).status,403);
 assert.deepEqual(Object.keys(office.body.drivers[0]).sort(),['name','userId']);assert.deepEqual(Object.keys(warehouseResponse.body.warehouseExecutors[0]).sort(),['employeeId','name']);
 console.log('Fulfillment candidates HTTP checks passed: office and warehouse own actions work without account-review permission; finance/driver denied; departed/disabled/non-driver accounts filtered; minimal fields only.');
} finally {await closeTestServer(server);}

const authSecret='candidate-contract-test-secret';
const runtimeUsers=['office','warehouse','driver','finance'].map(role=>({userId:`U-CAND-RUNTIME-${role}`,loginName:`candidate.${role}`,displayName:role,defaultRole:role,roles:[role],enabled:true,loginEnabled:true,passwordHash:'isolated-runtime-fixture',sessionVersion:1}));
const strictServer=createApiServer(withLocalRepositoryFixture({strictAuth:true,authSecret,applyProductionEnvFile:false,runtimeIdentityRepository:{kind:'test_memory',loadState:async()=>({users:[...users,...runtimeUsers],employeeAccounts:employees}),saveState:async()=>({})}}));
await strictServer.ready;await listenTestServer(strictServer);
try {
 const base=getTestServerBaseUrl(strictServer);
 for (const [role,status] of [['office',200],['warehouse',200],['driver',403],['finance',403]]) {
  const session=createRuntimeSession(`U-CAND-RUNTIME-${role}`,{authSecret,sessionVersion:1});
  const response=await fetch(base+'/api/fulfillments/operator-candidates',{headers:{authorization:`Bearer ${session.accessToken}`}});
  assert.equal(response.status,status);
  const json=await response.json();
  if (role==='office') assert.deepEqual(json.drivers,[{userId:'U-CAND-1',name:'在岗司机'}]);
  if (role==='warehouse') assert.equal(Object.hasOwn(json,'drivers'),false);
 }
 assert.equal((await fetch(base+'/api/fulfillments/operator-candidates',{headers:{'x-erp-user-id':'U-OFFICE-A'}})).status,401);
 console.log('Strict signed runtime session checks passed for office, warehouse, driver, finance; forged identity headers rejected.');
} finally {await closeTestServer(strictServer);}
