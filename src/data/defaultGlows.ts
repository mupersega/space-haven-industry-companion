import type { GlowMap } from '../components/GlowEditor'

/** The shipped fleet dressing, hand-authored in the glow-author widget:
 * the colony flagship's engine bank of raked teal jets, blue-boosted solar
 * arrays and green-boosted greenhouse domes; running lights and drive glows
 * on the escorts. Coordinates are fractions of each unflipped sprite. */
export const DEFAULT_GLOWS: GlowMap = {
  'ship-colony': [
    { x: 0.14095534751425667, y: 0.14334372827430245, color: '#28e2cc', size: 0.09, shape: 'jet', layer: 'below', angle: -155, opacity: 0.9, blend: 'add' },
    { x: 0.12999215265700143, y: 0.18298448092901964, color: '#28e2cc', size: 0.09, shape: 'jet', layer: 'below', angle: -155, opacity: 0.9, blend: 'add' },
    { x: 0.12451055522837383, y: 0.2275803276655765, color: '#28e2cc', size: 0.09, shape: 'jet', layer: 'below', angle: -155, opacity: 0.9, blend: 'add' },
    { x: 0.14917774365719808, y: 0.21271504542005756, color: '#28e2cc', size: 0.09, shape: 'jet', layer: 'below', angle: -155, opacity: 0.9, blend: 'add' },
    { x: 0.1519185423715119, y: 0.17307429276534034, color: '#28e2cc', size: 0.09, shape: 'jet', layer: 'below', angle: -155, opacity: 0.9, blend: 'add' },
    { x: 0.3409506068841292, y: 0.47326036387135234, color: '#2979ff', size: 0.045, shape: 'boost', layer: 'below', angle: 0, opacity: 0.9, blend: 'normal' },
    { x: 0.3957952107712874, y: 0.5426388465331213, color: '#2979ff', size: 0.045, shape: 'boost', layer: 'below', angle: 0, opacity: 0.9, blend: 'normal' },
    { x: 0.4314442032979402, y: 0.374148245783111, color: '#2979ff', size: 0.045, shape: 'boost', layer: 'below', angle: 0, opacity: 0.9, blend: 'normal' },
    { x: 0.37934182960513996, y: 0.3196365808345783, color: '#2979ff', size: 0.045, shape: 'boost', layer: 'below', angle: 0, opacity: 0.9, blend: 'normal' },
    { x: 0.7248628340942364, y: 0.7061738413787195, color: '#28e2cc', size: 0.015, shape: 'boost', layer: 'below', angle: 0, opacity: 0.9, blend: 'normal' },
    { x: 0.11882996114113865, y: 0.15114598008456803, color: '#28e2cc', size: 0.17, shape: 'round', layer: 'below', angle: 0, opacity: 0.65, blend: 'normal' },
    { x: 0.6124313961255622, y: 0.47326036387135234, color: '#66ff21', size: 0.08, shape: 'boost', layer: 'below', angle: 0, opacity: 0.95, blend: 'add' },
  ],
  'ship-hf1': [
    { x: 0.8261550260927082, y: 0.43587584453829914, color: '#ffa514', size: 0.02, shape: 'boost', layer: 'above', angle: -55, opacity: 1, blend: 'normal' },
    { x: 0.5822239405187795, y: 0.35303969746065716, color: '#ffa514', size: 0.015, shape: 'round', layer: 'above', angle: -55, opacity: 1, blend: 'normal' },
    { x: 0.2451056986581813, y: 0.6733394661608727, color: '#ffa514', size: 0.015, shape: 'round', layer: 'above', angle: -55, opacity: 1, blend: 'normal' },
    { x: 0.8261550260927082, y: 0.4248310249279469, color: '#ffa514', size: 0.015, shape: 'round', layer: 'above', angle: -55, opacity: 1, blend: 'normal' },
    { x: 0.9058500269218583, y: 0.11872985987418726, color: '#28e2cc', size: 0.145, shape: 'round', layer: 'below', angle: 0, opacity: 0.95, blend: 'add' },
    { x: 0.9223034080880058, y: 0.24574319834424804, color: '#28e2cc', size: 0.145, shape: 'round', layer: 'below', angle: 0, opacity: 0.95, blend: 'add' },
    { x: 0.9305300986710795, y: 0.2788771127277421, color: '#28e2cc', size: 0.145, shape: 'round', layer: 'below', angle: 0, opacity: 0.95, blend: 'add' },
    { x: 0.9085922571162163, y: 0.20156464583292255, color: '#28e2cc', size: 0.145, shape: 'round', layer: 'below', angle: 0, opacity: 0.95, blend: 'add' },
  ],
  'ship-hf2': [
    { x: 0.8946749939505534, y: 0.12285132106330451, color: '#28e2cc', size: 0.2, shape: 'round', layer: 'below', angle: 0, opacity: 0.9, blend: 'screen' },
    { x: 0.9330461759509466, y: 0.20084288594044306, color: '#28e2cc', size: 0.2, shape: 'round', layer: 'below', angle: 0, opacity: 0.9, blend: 'screen' },
    { x: 0.9303053772366329, y: 0.2501007163891621, color: '#28e2cc', size: 0.2, shape: 'round', layer: 'below', angle: 0, opacity: 0.9, blend: 'screen' },
    { x: 0.5219263688038758, y: 0.17210915151202358, color: '#ff3d55', size: 0.115, shape: 'boost', layer: 'above', angle: 0, opacity: 1, blend: 'normal' },
    { x: 0.34925604980210595, y: 0.2993585468378812, color: '#ff3d55', size: 0.115, shape: 'boost', layer: 'above', angle: 0, opacity: 1, blend: 'normal' },
    { x: 0.6617071032338798, y: 0.0859079482267652, color: '#ff3d55', size: 0.115, shape: 'boost', layer: 'above', angle: 0, opacity: 1, blend: 'normal' },
    { x: 0.8261550260927082, y: 0.5661717951017762, color: '#28e2cc', size: 0.04, shape: 'jet', layer: 'above', angle: -30, opacity: 1, blend: 'normal' },
    { x: 0.815191831235453, y: 0.5169139646530571, color: '#28e2cc', size: 0.04, shape: 'jet', layer: 'above', angle: -30, opacity: 1, blend: 'normal' },
  ],
  'ship-fs3': [
    { x: 0.11608773094678075, y: 0.47813943788050495, color: '#28e2cc', size: 0.2, shape: 'jet', layer: 'below', angle: -150, opacity: 0.95, blend: 'add' },
    { x: 0.12979888191857028, y: 0.5261534400107648, color: '#28e2cc', size: 0.2, shape: 'jet', layer: 'below', angle: -150, opacity: 0.95, blend: 'add' },
    { x: 0.15722118386214937, y: 0.49414410525725827, color: '#28e2cc', size: 0.2, shape: 'jet', layer: 'below', angle: -150, opacity: 0.95, blend: 'add' },
    { x: 0.08318096861448585, y: 0.1500437566570622, color: '#28e2cc', size: 0.2, shape: 'round', layer: 'below', angle: -150, opacity: 0.95, blend: 'add' },
  ],
  'ship-fs2': [
    { x: 0.11334550075242285, y: 0.3214285565209406, color: '#28e2cc', size: 0.2, shape: 'round', layer: 'below', angle: 0, opacity: 0.9, blend: 'screen' },
    { x: 0.24223031988724453, y: 0.1618540958367857, color: '#28e2cc', size: 0.2, shape: 'round', layer: 'below', angle: 0, opacity: 0.9, blend: 'screen' },
    { x: 0.5850090941819831, y: 0.6268996669734657, color: '#ff3d55', size: 0.045, shape: 'round', layer: 'below', angle: 0, opacity: 1, blend: 'normal' },
  ],
}
