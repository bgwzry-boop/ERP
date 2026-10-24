import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {buildRawMaterialQrMatrix} from '../src/domain/rawMaterialLabelQr.js';
const fontUrl=new URL('./print-assets/ERPLabelSansSC-Regular.ttf',import.meta.url),sourceUrl=new URL('./print-assets/source.json',import.meta.url);
const mm=value=>value*72/25.4;
const fail=message=>{throw Object.assign(new Error(message),{code:'PACKAGE_LABEL_PDF_INVALID'});};
export async function buildPhysicalPackageLabelPdf(template) {
 if(template?.documentType!=='package_label'||template.priceHidden!==true||!Array.isArray(template.labels)||!template.labels.length||template.labels.length>1000)fail('缺少完整的实际包裹挂牌信息。');
 const bytes=readFileSync(fontUrl),source=JSON.parse(readFileSync(sourceUrl,'utf8'));
 if(createHash('sha256').update(bytes).digest('hex')!==source.fontSha256)fail('挂牌字体校验失败，请恢复经过核对的字体资产。');
 // Noto CJK glyph subsetting in fontkit 1.1.1 drops outlines. Embed the one shared static font in full; disable contextual glyph substitutions so trace codes also extract exactly.
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);const font=await doc.embedFont(bytes,{subset:false,features:{locl:false,liga:false,clig:false,calt:false}});
 const supported=new Set(font.getCharacterSet()),seen=new Set();
 const widthMm=Number(template.paper?.widthMm),heightMm=Number(template.paper?.heightMm);
 if(!Number.isFinite(widthMm)||widthMm<60||widthMm>150||!Number.isFinite(heightMm)||heightMm<80||heightMm>300)fail('挂牌纸张须明确配置宽60–150毫米、高80–300毫米。');
 const width=mm(widthMm),height=mm(heightMm),margin=mm(4),available=width-2*margin;
 for(const [index,label] of template.labels.entries()){
  if(typeof label.packageId!=='string'||!/^PKG-[A-Z0-9-]+$/.test(label.packageId)||seen.has(label.packageId)||label.barcodeText!==label.packageId||label.sequence!==`${index+1}/${template.labels.length}`||!Array.isArray(label.contents)||!label.contents.length)fail('逐包编号、独立包码或包内明细不完整。');
  seen.add(label.packageId);const sum=label.contents.reduce((total,item)=>total+(Number.isSafeInteger(item.packedQty)&&item.packedQty>0?item.packedQty:NaN),0);if(sum!==label.packedQty)fail('包内明细与实际总数量不一致。');
  const page=doc.addPage([width,height]);let y=height-margin-15;
  const draw=(text,size=10,x=margin)=>{
   const value=String(text??'');for(const char of value)if(!supported.has(char.codePointAt(0)))fail('挂牌内容含字体未覆盖的字符，请人工核对后重试。');
   page.drawText(value,{x,y,size,font,color:rgb(0,0,0)});
  };
  const wrapped=(value,size=10)=>{
   let line='';for(const ch of String(value??'')){if(line&&font.widthOfTextAtSize(line+ch,size)>available){draw(line,size);y-=size+3;line='';}line+=ch;}if(line){draw(line,size);y-=size+3;}
  };
  draw('内部包裹挂牌',14);draw(label.sequence,16,width-margin-font.widthOfTextAtSize(label.sequence,16));y-=23;
  wrapped(`客户：${label.customerName||'见订单'}`,10);y-=4;
  for(const item of label.contents){
   wrapped([item.size,item.bagColor,item.handleColor&&`提手${item.handleColor}`,item.handleType,`${item.packedQty}个`].filter(Boolean).join(' · '),10);
   wrapped(`明细 ${item.orderLineId}`,8);y-=4;
  }
  wrapped(`本包合计 ${label.packedQty} 个`,11);
  const qr=buildRawMaterialQrMatrix(label.packageId);if(!qr)fail('无法生成此包的二维码，请核对包码。');
  const qrSide=Math.min(mm(32),width-2*margin),qrBottom=mm(13),qrTop=qrBottom+qrSide;
  if(y<qrTop+10)fail('此包内容超出当前挂牌纸张，未提交打印；请配置更长纸张或联系办公室核对版式。');
  const cell=qrSide/(qr.size+8),qrLeft=(width-qrSide)/2;
  // Quiet zone is four modules on all sides; vector modules retain scanner contrast.
  for(let row=0;row<qr.size;row++)for(let col=0;col<qr.size;col++)if(qr.modules[row][col])page.drawRectangle({x:qrLeft+(col+4)*cell,y:qrBottom+(qr.size+3-row)*cell,width:cell,height:cell,color:rgb(0,0,0)});
  y=mm(11);wrapped(label.packageId,7);y=mm(3);draw('贴牌前逐项核对实物 · 挂牌不含金额',7);
 }
 doc.setTitle('内部实际包裹挂牌');doc.setSubject('独立包码与实物明细');doc.setProducer('ERP physical package label renderer');
 return Buffer.from(await doc.save());
}
