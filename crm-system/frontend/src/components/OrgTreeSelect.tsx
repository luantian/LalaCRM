import { useEffect, useState } from 'react'
import { Select } from 'antd'
import { getOrganizationsSimple } from '../services/api'

interface OrgTreeSelectProps {
  value?: number | null
  onChange?: (value: number | null) => void
  placeholder?: string
  disabled?: boolean
  allowClear?: boolean
  style?: React.CSSProperties
}

interface OrgNode {
  id: number
  name: string
}

/**
 * 组织选择器
 * 数据源为平铺组织列表（/organizations/simple，无层级），使用普通 Select 渲染。
 * 此前误用 TreeSelect：树形组件每行自带 28px 开关图标占位 + 缩进容器，
 * 导致选项名称前出现大片空白（数据并无层级，占位毫无意义）。
 * 组件名保留 OrgTreeSelect 以兼容既有引用。
 */
export function OrgTreeSelect({
  value,
  onChange,
  placeholder = '请选择客户',
  disabled = false,
  allowClear = true,
  style
}: OrgTreeSelectProps) {
  const [treeData, setTreeData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    getOrganizationsSimple()
      .then((data: any) => {
        const orgs = Array.isArray(data) ? data : []
        setTreeData(orgs.map((org: OrgNode) => ({
          label: org.name,
          value: org.id,
        })))
      })
      .catch(() => setTreeData([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Select
      value={value || undefined}
      onChange={(v) => onChange?.(v ?? null)}
      options={treeData}
      placeholder={placeholder}
      disabled={disabled}
      loading={loading}
      allowClear={allowClear}
      showSearch
      optionFilterProp="label"
      style={{ width: '100%', ...style }}
      notFoundContent={loading ? '加载中...' : '暂无组织'}
    />
  )
}
