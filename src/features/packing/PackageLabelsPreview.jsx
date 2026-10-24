import {buildRawMaterialQrMatrix} from '../../domain/rawMaterialLabelQr.js';
import {packageLabelRows} from '../../../shared/packageContents.js';
export function PackageLabelsPreview({packages=[]}) {
 return <div className="package-label-preview" aria-label="实际包裹挂牌预览">{packageLabelRows(packages).map(label=>{
  const qr=buildRawMaterialQrMatrix(label.packageId),matrix=Array.isArray(qr)?qr:qr?.modules;
  return <article key={label.packageId} className="package-label-paper"><header><strong>内部包裹挂牌</strong><b>{label.sequence}</b></header><ul>{label.contents.map(item=><li key={item.fulfillmentId}><strong>{[item.size,item.bagColor,item.handleColor&&`提手${item.handleColor}`].filter(Boolean).join(' · ')}</strong><span>{item.packedQty} 个</span></li>)}</ul><p>本包合计 {label.packedQty} 个</p>{matrix?<svg role="img" aria-label={`包裹二维码 ${label.packageId}`} viewBox={`-4 -4 ${matrix.length+8} ${matrix.length+8}`} shapeRendering="crispEdges"><rect x="-4" y="-4" width={matrix.length+8} height={matrix.length+8} fill="white"/>{matrix.flatMap((row,y)=>row.map((dark,x)=>dark?<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="black"/>:null))}</svg>:<p role="alert">此包码无法生成二维码，请联系办公室。</p>}<small>{label.packageId}</small><footer>核对实物后贴牌 · 挂牌不含金额</footer></article>;
 })}</div>;
}
