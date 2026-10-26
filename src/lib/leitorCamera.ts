import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

// Leitura de código pela câmera do celular (etiqueta QR da produção, código de barras do estoque).
// As etiquetas são pequenas (rolo de 40×25 mm): na resolução padrão da câmera (640×480) as barras/
// módulos ficavam com 1-3 pixels e o celular não lia nada, enquanto o leitor USB do almoxarifado
// lia na hora. Aqui: câmera em HD com foco contínuo e, onde existe (Chrome/Android), o leitor
// nativo do aparelho (BarcodeDetector), bem melhor; sem ele (iPhone), zxing em modo "try harder".
// Devolve a função que desliga a câmera.

export type TipoLeitura = 'qr' | 'barras';

const NATIVO: Record<TipoLeitura, string[]> = {
  qr: ['qr_code'],
  barras: ['code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'upc_e', 'itf', 'qr_code'],
};
const ZXING: Record<TipoLeitura, BarcodeFormat[]> = {
  qr: [BarcodeFormat.QR_CODE],
  barras: [BarcodeFormat.CODE_128, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_39, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.QR_CODE],
};

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats: () => Promise<string[]> };

export async function iniciarLeitorCamera(video: HTMLVideoElement, tipo: TipoLeitura, aoLer: (texto: string) => void): Promise<() => void> {
  const constraints: MediaTrackConstraints = { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } };
  let parado = false;

  const BD = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  const suportados = BD ? await BD.getSupportedFormats().catch((): string[] => []) : [];
  const formatos = NATIVO[tipo].filter(f => suportados.includes(f));

  if (BD && formatos.length > 0) {
    const detector = new BD({ formats: formatos });
    const stream = await navigator.mediaDevices.getUserMedia({ video: constraints });
    const [track] = stream.getVideoTracks();
    track?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => { /* aparelho sem foco ajustável */ });
    video.srcObject = stream;
    await video.play().catch(() => { /* autoplay bloqueado: o frame chega mesmo assim */ });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      if (parado) return;
      try {
        const codigos = await detector.detect(video);
        if (codigos[0]?.rawValue) aoLer(codigos[0].rawValue);
      } catch { /* frame ainda sem imagem */ }
      if (!parado) timer = setTimeout(loop, 150);
    };
    loop();
    return () => {
      parado = true;
      clearTimeout(timer);
      stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    };
  }

  const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true], [DecodeHintType.POSSIBLE_FORMATS, ZXING[tipo]]]);
  const controls = await new BrowserMultiFormatReader(hints).decodeFromConstraints({ video: constraints }, video, (resultado) => {
    if (!parado && resultado) aoLer(resultado.getText());
  });
  return () => { parado = true; controls.stop(); };
}
