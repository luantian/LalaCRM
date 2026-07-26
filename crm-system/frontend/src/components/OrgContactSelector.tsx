import { useEffect, useState } from 'react'
import { Select, Spin } from 'antd'
import { getOrganizationContacts, getAllContacts } from '../services/api'

interface OrgContactSelectorProps {
  organizationId?: number | null
  value?: number | null
  onChange?: (value: number | null) => void
  onContactSelect?: (contactId: number | null, organizationId: number | null) => void
  placeholder?: string
  disabled?: boolean
  style?: React.CSSProperties
  fallbackLabel?: string // 编辑回显时，选项未加载前的显示文字
}

interface Contact {
  id: number
  name: string
  title?: string
  phone?: string
  organizationId?: number
  organizationName?: string
}

/**
 * 联系人选择器
 * - 当提供 organizationId 时：加载该组织的联系人（级联模式）
 * - 当不提供 organizationId 时：加载所有联系人（全局模式，显示所属组织）
 */
export function OrgContactSelector({
  organizationId,
  value,
  onChange,
  onContactSelect,
  placeholder = '请选择联系人',
  disabled = false,
  style,
  fallbackLabel
}: OrgContactSelectorProps) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    // 如果传入了 organizationId，只加载该组织的联系人（级联模式）
    if (organizationId) {
      setLoading(true)
      getOrganizationContacts(organizationId)
        .then((data: any) => {
          if (!cancelled) {
            const list = Array.isArray(data) ? data : (data?.data || [])
            setContacts(list)
            if (value && !list.find((c: Contact) => c.id === value)) {
              onChange?.(null)
              onContactSelect?.(null, null)
            }
          }
        })
        .catch(() => { if (!cancelled) setContacts([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    } else {
      // 没有 organizationId，加载所有联系人（全局模式）
      setLoading(true)
      getAllContacts()
        .then((data: any) => {
          if (!cancelled) {
            const list = Array.isArray(data) ? data : (data?.data || [])
            setContacts(list)
          }
        })
        .catch(() => { if (!cancelled) setContacts([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }

    return () => { cancelled = true }
  }, [organizationId])

  const handleChange = (selectedId: number | null) => {
    onChange?.(selectedId)
    if (onContactSelect) {
      const contact = contacts.find(c => c.id === selectedId)
      onContactSelect(selectedId, contact?.organizationId || null)
    }
  }

  // 构建选项列表，确保当前值始终有对应选项（编辑回显）
  const options = contacts.map(c => ({
    value: c.id,
    label: organizationId
      ? `${c.name}${c.title ? ` (${c.title})` : ''}${c.phone ? ` ${c.phone}` : ''}`
      : `${c.name}${c.title ? ` (${c.title})` : ''} — ${c.organizationName || ''}`,
  }))
  // 如果有当前值但选项中没有，加入 fallback 选项保证回显
  if (value && !options.some(o => o.value === value) && fallbackLabel) {
    options.unshift({ value, label: fallbackLabel })
  }

  return (
    <Select
      value={value || undefined}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      loading={loading}
      allowClear
      showSearch
      optionFilterProp="label"
      style={{ width: '100%', ...style }}
      notFoundContent={loading ? <Spin size="small" /> : '暂无联系人'}
      options={options}
    />
  )
}
