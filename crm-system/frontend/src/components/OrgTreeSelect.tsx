import { useEffect, useState } from 'react'
import { TreeSelect } from 'antd'
import { getOrganizationTree } from '../services/api'

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
  type: string
  children?: OrgNode[]
}

/**
 * 将组织树数据转换为 TreeSelect 需要的 treeData 格式
 */
function transformTree(nodes: OrgNode[]): any[] {
  return nodes.map(node => ({
    title: node.name,
    value: node.id,
    key: node.id,
    selectable: true,
    icon: node.type === 'GROUP' ? '🏢' : node.type === 'COMPANY' ? '🏬' : '👤',
    children: node.children ? transformTree(node.children) : [],
  }))
}

/**
 * 组织树形选择器
 * 使用 TreeSelect 展示组织的层级结构（集团/公司/分公司）
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
    let cancelled = false
    setLoading(true)
    getOrganizationTree()
      .then((data: any) => {
        if (!cancelled) {
          const tree = data?.tree || data || []
          setTreeData(transformTree(Array.isArray(tree) ? tree : []))
        }
      })
      .catch(() => { if (!cancelled) setTreeData([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
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
