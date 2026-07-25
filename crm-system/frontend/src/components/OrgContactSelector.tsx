import { useEffect, useState } from 'react'
import { Select, Spin } from 'antd'
import { getOrganizationContacts } from '../services/api'

interface OrgContactSelectorProps {
  organizationId?: number | null
  value?: number | null
  onChange?: (value: number | null) => void
  placeholder?: string
  disabled?: boolean
  style?: React.CSSProperties
}

interface Contact {
  id: number
  name: string
  title?: string
  phone?: string
}

/**
 * 组织联系人级联选择器
 * 根据选中的组织ID自动加载联系人列表
 */
export function OrgContactSelector({
  organizationId,
  value,
  onChange,
  placeholder = '请选择联系人',
  disabled = false,
  style
}: OrgContactSelectorProps) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!organizationId) {
      setContacts([])
      if (value) onChange?.(null)
      return
    }
    let cancelled = false
    setLoading(true)
    getOrganizationContacts(organizationId)
      .then((data: any) => {
        if (!cancelled) {
          const list = Array.isArray(data) ? data : (data?.data || [])
          setContacts(list)
          // 如果当前值不在新列表中，清空
          if (value && !list.find((c: Contact) => c.id === value)) {
            onChange?.(null)
          }
        }
      })
      .catch(() => { if (!cancelled) setContacts([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [organizationId])

  return (
    <Select
      value={value || undefined}
      onChange={(v) => onChange?.(v ?? null)}
      placeholder={organizationId ? placeholder : '请先选择组织'}
      disabled={disabled || !organizationId}
      loading={loading}
      allowClear
      showSearch
      optionFilterProp="label"
      style={{ width: '100%', ...style }}
      notFoundContent={loading ? <Spin size="small" /> : '暂无联系人'}
      options={contacts.map(c => ({
        value: c.id,
        label: `${c.name}${c.title ? ` (${c.title})` : ''}${c.phone ? ` ${c.phone}` : ''}`,
      }))}
    />
  )
}
