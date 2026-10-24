import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawnSync} from 'node:child_process';
import {PDFDocument,PDFName,PDFDict} from 'pdf-lib';import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {buildPhysicalPackageLabelPdf} from './physical-package-label-pdf.mjs';
const labels=Array.from({length:5},(_,i)=>({packageId:`PKG-00000000-1111-4222-8333-${String(i+1).padStart(12,'0')}`,barcodeText:`PKG-00000000-1111-4222-8333-${String(i+1).padStart(12,'0')}`,sequence:`${i+1}/5`,customerName:'合成客户',packedQty:1000,amount:'不应打印的财务字段',contents:[{orderLineId:'ORD-SYNTHETIC-01',size:'25*32*10',bagColor:'白色',handleType:'加长提',packedQty:600},{orderLineId:'ORD-SYNTHETIC-02',size:'30*40*10',bagColor:'红色',handleColor:'酒红',packedQty:400}]}));
const template={documentType:'package_label',priceHidden:true,paper:{widthMm:80,heightMm:100},labels};
const root=await mkdtemp(join(tmpdir(),'erp-package-label-pdf-'));
try {
 const payload={printJobId:'PJ-MIXED-PDF-CHECK',printDeviceId:'DEVICE-MIXED-PDF',printDeviceName:'SyntheticLabelPrinter',documentType:'package_label',targetType:'fulfillment',targetId:'F-MIXED-PDF',payloadSnapshot:{printTemplate:template},printDeviceSnapshot:{settings:{driverMode:'system_printer'}}};
 const result=spawnSync(process.execPath,['scripts/print-command-bridge.mjs','--storage-root',root,'--mode','cups_lp','--cups-printer','SyntheticLabelPrinter','--cups-allowlist','SyntheticLabelPrinter','--cups-command',process.execPath,'--cups-command-args-json',JSON.stringify([resolve('scripts/fake-cups-lp.mjs'),'--printer','{cupsPrinterName}','{printFile}'])],{input:JSON.stringify(payload),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const receipt=JSON.parse(result.stdout);assert.equal(receipt.status,'sent');const bytes=await readFile(join(root,'print-command-bridge','documents',`${receipt.externalJobId}.pdf`));assert.ok(bytes.subarray(0,5).equals(Buffer.from('%PDF-')));
 const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),5);let embedded=false;
 for(const [,object] of pdf.context.enumerateIndirectObjects())if(object instanceof PDFDict&&(object.has(PDFName.of('FontFile2'))||object.has(PDFName.of('FontFile3'))))embedded=true;
 assert.equal(embedded,true,'CJK outlines must be embedded; host substitution is not accepted');
 const document=await getDocument({data:new Uint8Array(bytes),useSystemFonts:false}).promise;
 for(let i=1;i<=5;i++){const page=await document.getPage(i),text=(await page.getTextContent()).items.map(row=>row.str).join('');assert.match(text,new RegExp(`${i}/5`));for(const value of ['内部包裹挂牌','合成客户','白色','红色','600个','400个','1000 个',labels[i-1].packageId,'ORD-SYNTHETIC-01','ORD-SYNTHETIC-02'])assert.ok(text.includes(value),`Page ${i} missing ${value}: ${text}`);assert.doesNotMatch(text,/单价|应收|不应打印的财务字段/);assert.equal(page.view[2]>200&&page.view[3]>280,true);}
 await document.destroy();
 for(const value of [null,{...template,priceHidden:false},{...template,labels:[{...labels[0],contents:[{...labels[0].contents[0],packedQty:999}]}]}, {...template,labels:[{...labels[0],sequence:'1/1',customerName:'𠮷'.repeat(1000)}]}])await assert.rejects(()=>buildPhysicalPackageLabelPdf(value));
 if(process.env.ERP_PACKAGE_LABEL_PDF_QA_DIR){const output=resolve(process.env.ERP_PACKAGE_LABEL_PDF_QA_DIR);const {mkdir}=await import('node:fs/promises');await mkdir(output,{recursive:true});await writeFile(join(output,'physical-package-labels.pdf'),bytes);await writeFile(join(output,'expected-codes.json'),JSON.stringify(labels.map(p=>p.packageId)));}
 assert.equal((await readdir(join(root,'print-command-bridge','documents'))).filter(f=>f.endsWith('.txt')).length,0);
 console.log('PASS physical package label: real bridge/fake lp captures five-page PDF, embedded CJK, exact text/code per page, financial-field exclusion, overflow fails closed. Physical hardware untested.');
}finally{await rm(root,{recursive:true,force:true});}
