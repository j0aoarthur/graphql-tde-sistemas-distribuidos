// Placas brasileiras: modelo antigo (ABC-1234) e Mercosul (ABC1D23).
// Armazenamento sempre normalizado (maiusculas, sem hifen); o hifen e apenas apresentacao.
const LETTER=/[A-Z]/,DIGIT=/[0-9]/,ALNUM=/[A-Z0-9]/;
// Posicao -> tipo de caractere aceito: LLL N A N N
const SLOTS=[LETTER,LETTER,LETTER,DIGIT,ALNUM,DIGIT,DIGIT];
function normalizePlate(value){return String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function isValidPlate(value){const plate=normalizePlate(value);return plate.length===7&&[...plate].every((c,i)=>SLOTS[i].test(c));}
function formatPlate(value){const plate=normalizePlate(value);return /^[A-Z]{3}[0-9]{4}$/.test(plate)?`${plate.slice(0,3)}-${plate.slice(3)}`:plate;}
// Mascara de digitacao: descarta o que nao cabe na posicao e coloca o hifen quando a placa e do modelo antigo.
function maskPlate(raw){
  let out='';
  for(const c of normalizePlate(raw)){if(out.length<7&&SLOTS[out.length].test(c))out+=c;}
  return out.length>=5&&DIGIT.test(out[4])?`${out.slice(0,3)}-${out.slice(3)}`:out;
}
function plateKind(value){const plate=normalizePlate(value);if(!isValidPlate(plate))return null;return DIGIT.test(plate[4])?'ANTIGA':'MERCOSUL';}
module.exports={normalizePlate,isValidPlate,formatPlate,maskPlate,plateKind};
