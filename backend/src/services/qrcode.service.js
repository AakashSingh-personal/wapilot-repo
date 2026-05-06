import QRCode from 'qrcode';

export async function qrPngDataUrl(upiLink) {
  const dataUrl = await QRCode.toDataURL(upiLink, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
  });
  return dataUrl;
}

export async function qrPngBuffer(upiLink) {
  return QRCode.toBuffer(upiLink, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
  });
}
