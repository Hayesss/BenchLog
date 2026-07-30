/** 样本类型与视觉元数据（样本库两页共享） */
export const SAMPLE_TYPES = ['DNA', 'RNA', '蛋白', '细胞', '组织', '血清', '质粒', '引物', '其他'] as const
export type SampleType = (typeof SAMPLE_TYPES)[number]

export const TYPE_COLOR: Record<string, string> = {
  DNA: '#3E7C6B',
  RNA: '#5B7C99',
  蛋白: '#B08D57',
  细胞: '#B0707C',
  组织: '#8A7CA8',
  血清: '#7C9161',
  质粒: '#B98A3E',
  引物: '#5A8C7C',
  其他: '#8A9099',
}

/** 孔位坐标：row 0→A、col 0→1，即 (0,0)=A1、(7,11)=H12 */
export function wellLabel(row: number, col: number): string {
  return `${String.fromCharCode(65 + row)}${col + 1}`
}
