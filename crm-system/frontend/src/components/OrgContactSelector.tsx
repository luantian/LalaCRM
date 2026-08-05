import { useEffect, useState, useRef } from 'react'
import { Select, Spin } from 'antd'
import { getOrganizationContactsSimple, getAllContactsSimple, getContactDetail } from '../services/api'

interface OrgContactSelectorProps {
  organizationId?: number | null
  value?: number | null
  onChange?: (value: number | null) => void
  onContactSelect?: (contactId: number | null, organizationId: number | null) => void
  placeholder?: string
  disabled?: boolean
  style?: React.CSSProperties
}

interface Contact {
  id: number
  name: string
  title?: string
  organizationId?: number
  organizationName?: string
}

/**
 * 联系人选择器
 * - 当提供 organizationId 时：加载该组织的联系人（级联模式）
 * - 当不提供 organizationId 时：加载所有联系人（全局模式，显示所属组织）
 * - 当有 value 但选项未加载时：自动通过 API 获取该联系人信息用于回显
 */
export function OrgContactSelector({
  organizationId,
  value,
  onChange,
  onContactSelect,
  placeholder = '请选择联系人',
  disabled = false,
  style
}: OrgContactSelectorProps) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  // 记录已为当前 value 做过回显获取，避免重复请求
  const fetchedForValue = useRef<number | null>(null)

  // 加载联系人列表
  useEffect(() => {
    let cancelled = false

    if (organizationId) {
      setLoading(true)
      getOrganizationContactsSimple(organizationId)
        .then((data: any) => {
          if (!cancelled) {
            const list = Array.isArray(data) ? data : (data?.data || [])
            setContacts(list)
          }
        })
        .catch(() => { if (!cancelled) setContacts([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    } else {
      setLoading(true)
      getAllContactsSimple()
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

  // 当有 value 但联系人列表中没有该 ID 时，通过 API 获取回显信息
  useEffect(() => {
    if (value && !contacts.some(c => c.id === value) && fetchedForValue.current !== value) {
      fetchedForValue.current = value
      getContactDetail(value)
        .then((data: any) => {
          if (data && data.id) {
            setContacts(prev => {
              if (prev.some(c => c.id === data.id)) return prev
              return [data, ...prev]
            })
          }
        })
        .catch(() => { /* 联系人可能已删除，忽略 */ })
    }
    // 当 value 变化时重置
    if (!value) {
      fetchedForValue.current = null
    }
  }, [value, contacts])

  const handleChange = (selectedId: number | null) => {
    onChange?.(selectedId)
    if (onContactSelect) {
      const contact = contacts.find(c => c.id === selectedId)
      onContactSelect(selectedId, contact?.organizationId || null)
    }
  }

  const options = contacts.map(c => ({
    value: c.id,
    label: organizationId
      ? `${c.name}${c.title ? ` (${c.title})` : ''}`
      : `${c.name}${c.title ? ` (${c.title})` : ''} — ${c.organizationName || ''}`,
  }))

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
