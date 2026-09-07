import { Response } from 'express'
const ExcelJS = require('exceljs')

/**
 * 统一样式的 Excel 导出(与日报排版同款):
 * 大标题 + 导出信息副标题 + 深蓝底白字表头 + 隔行斑马纹 + 细边框 +
 * 冻结表头 + 横向 A4 适宽打印 + 内容列自动换行与行高估算。
 * (SheetJS 社区版不支持写样式,样式导出统一走 exceljs)
 */

export interface StyledColumn {
  /** 行数据取值键(缺省用 label) */
  key?: string
  /** 表头文字 */
  label: string
  /** 列宽(字符) */
  width: number
  /** 横向对齐,默认 left */
  align?: 'center' | 'left' | 'right'
  /** 自动换行(长文本列) */
  wrap?: boolean
  /** 数字格式(如金额 '#,##0.00') */
  numFmt?: string
}

/** 显示宽度估算(CJK 按双宽计) */
function displayWidth(s: string): number {
  return [...String(s || '')].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 2 : 1), 0)
}

export async function exportStyledExcel(
  res: Response,
  filename: string,
  sheetName: string,
  title: string,
  columns: StyledColumn[],
  rows: any[],
  /** 副标题统计文案;缺省"共 N 条记录" */
  summary?: string
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }
  })

  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })

  // 行1:大标题
  ws.mergeCells(1, 1, 1, columns.length)
  const titleCell = ws.getCell(1, 1)
  titleCell.value = title
  titleCell.font = { name: '微软雅黑', size: 16, bold: true, color: { argb: 'FF16365C' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 32

  // 行2:副标题(导出信息)
  ws.mergeCells(2, 1, 2, columns.length)
  const subCell = ws.getCell(2, 1)
  subCell.value = `导出时间：${new Date().toLocaleString('zh-CN')} ｜ ${summary || `共 ${rows.length} 条记录`}`
  subCell.font = { name: '微软雅黑', size: 9, color: { argb: 'FF808080' } }
  subCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(2).height = 18

  // 行3:表头
  const headerRow = ws.getRow(3)
  headerRow.values = columns.map(c => c.label)
  headerRow.height = 24
  headerRow.eachCell(cell => {
    cell.font = { name: '微软雅黑', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF1F3864' } }, left: { style: 'thin', color: { argb: 'FF1F3864' } },
      bottom: { style: 'thin', color: { argb: 'FF1F3864' } }, right: { style: 'thin', color: { argb: 'FF1F3864' } }
    }
  })

  // 数据行:隔行斑马 + 细边框 + 按列对齐/换行/数字格式
  const thin = { style: 'thin' as const, color: { argb: 'FFC9D3E0' } }
  rows.forEach((r, ri) => {
    const row = ws.getRow(4 + ri)
    row.values = columns.map(c => {
      const v = r[c.key || c.label]
      return v === '' || v == null ? undefined : v
    })
    const zebra = ri % 2 === 1 ? 'FFF4F8FC' : 'FFFFFFFF'
    row.eachCell({ includeEmpty: true }, (cell: any, col: number) => {
      const c = columns[col - 1]
      cell.font = { name: '微软雅黑', size: 10, color: { argb: 'FF333333' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebra } }
      cell.border = { top: thin, left: thin, bottom: thin, right: thin }
      // 注意:vertical 必须用 'middle'(exceljs 写入会丢弃 'center' 的垂直值,落回 Excel 默认底对齐)
      cell.alignment = { horizontal: c.align || 'left', vertical: 'middle', wrapText: !!c.wrap }
      if (c.numFmt && typeof cell.value === 'number') cell.numFmt = c.numFmt
    })
    // 行高按换行列内容估算(CJK 按双宽计)
    let lines = 1
    for (const c of columns) {
      if (c.wrap) {
        lines = Math.max(lines, Math.ceil(displayWidth(r[c.key || c.label]) / Math.max(8, c.width - 2)))
      }
    }
    row.height = Math.min(150, Math.max(20, lines * 14 + 6))
  })

  const buffer = await wb.xlsx.writeBuffer()
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}`)
  res.send(Buffer.from(buffer))
}
