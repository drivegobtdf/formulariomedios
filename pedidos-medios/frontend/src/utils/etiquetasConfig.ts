import { EtiquetaColor } from '../services/gestionApi';

export interface ColorOption {
  key: EtiquetaColor;
  label: string;
  bgLight: string;
  borderLight: string;
  textLight: string;
  bgDark: string;
  borderDark: string;
  textDark: string;
  dotColor: string;
}

export const ETIQUETA_COLOR_OPTIONS: ColorOption[] = [
  {
    key: 'azul',
    label: 'Azul',
    bgLight: '#e0f2fe',
    borderLight: '#bae6fd',
    textLight: '#0369a1',
    bgDark: 'rgba(3, 105, 161, 0.25)',
    borderDark: 'rgba(56, 189, 248, 0.4)',
    textDark: '#7dd3fc',
    dotColor: '#0284c7',
  },
  {
    key: 'verde',
    label: 'Verde',
    bgLight: '#dcfce7',
    borderLight: '#bbf7d0',
    textLight: '#15803d',
    bgDark: 'rgba(21, 128, 61, 0.25)',
    borderDark: 'rgba(74, 222, 128, 0.4)',
    textDark: '#86efac',
    dotColor: '#16a34a',
  },
  {
    key: 'ambar',
    label: 'Ámbar',
    bgLight: '#fef3c7',
    borderLight: '#fde68a',
    textLight: '#b45309',
    bgDark: 'rgba(180, 83, 9, 0.25)',
    borderDark: 'rgba(251, 191, 36, 0.4)',
    textDark: '#fcd34d',
    dotColor: '#d97706',
  },
  {
    key: 'rojo',
    label: 'Rojo',
    bgLight: '#fee2e2',
    borderLight: '#fecaca',
    textLight: '#b91c1c',
    bgDark: 'rgba(185, 28, 28, 0.25)',
    borderDark: 'rgba(248, 113, 113, 0.4)',
    textDark: '#fca5a5',
    dotColor: '#dc2626',
  },
  {
    key: 'morado',
    label: 'Morado',
    bgLight: '#f3e8ff',
    borderLight: '#e9d5ff',
    textLight: '#7e22ce',
    bgDark: 'rgba(126, 34, 206, 0.25)',
    borderDark: 'rgba(192, 132, 252, 0.4)',
    textDark: '#d8b4fe',
    dotColor: '#9333ea',
  },
  {
    key: 'rosa',
    label: 'Rosa',
    bgLight: '#fce7f3',
    borderLight: '#fbcfe8',
    textLight: '#be185d',
    bgDark: 'rgba(190, 24, 93, 0.25)',
    borderDark: 'rgba(244, 114, 182, 0.4)',
    textDark: '#f472b6',
    dotColor: '#db2777',
  },
  {
    key: 'indigo',
    label: 'Índigo',
    bgLight: '#e0e7ff',
    borderLight: '#c7d2fe',
    textLight: '#4338ca',
    bgDark: 'rgba(67, 56, 202, 0.25)',
    borderDark: 'rgba(129, 140, 248, 0.4)',
    textDark: '#a5b4fc',
    dotColor: '#4f46e5',
  },
  {
    key: 'gris',
    label: 'Gris',
    bgLight: '#f1f5f9',
    borderLight: '#cbd5e1',
    textLight: '#475569',
    bgDark: 'rgba(71, 85, 105, 0.25)',
    borderDark: 'rgba(148, 163, 184, 0.4)',
    textDark: '#cbd5e1',
    dotColor: '#64748b',
  },
];

export function getEtiquetaColorOption(color?: string | null): ColorOption {
  const c = color?.toLowerCase()?.trim();
  const found = ETIQUETA_COLOR_OPTIONS.find((opt) => opt.key === c);
  return found || ETIQUETA_COLOR_OPTIONS[0]; // fallback: azul
}

export function getEtiquetaStyle(color?: string | null): React.CSSProperties {
  const opt = getEtiquetaColorOption(color);
  return {
    backgroundColor: 'var(--pedidos-etiqueta-bg, ' + opt.bgLight + ')',
    borderColor: 'var(--pedidos-etiqueta-border, ' + opt.borderLight + ')',
    color: 'var(--pedidos-etiqueta-text, ' + opt.textLight + ')',
  };
}
