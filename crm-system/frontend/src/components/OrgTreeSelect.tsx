import { useEffect, useState } from 'react'
import { TreeSelect } from 'antd'
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
 * 使用 Select 展示扁平化的组织列表（无需权限）
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
    <TreeSelect
      value={value || undefined}
      onChange={(v) => onChange?.(v ?? null)}
      treeData={treeData}
      placeholder={placeholder}
      disabled={disabled}
      loading={loading}
      allowClear={allowClear}
      showSearch
      treeNodeFilterProp="title"
      treeDefaultExpandAll
      style={{ width: '100%', ...style }}
      notFoundContent={loading ? '加载中...' : '暂无组织'}
    />
  )
}
