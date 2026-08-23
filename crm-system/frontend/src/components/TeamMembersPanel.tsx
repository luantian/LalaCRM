import { useState } from 'react'
import { Button, Modal, Select, Table, Tag, Popconfirm, message } from 'antd'
import { PlusOutlined, UserDeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

export interface TeamMemberRow {
  id: number
  userId: number
  createdAt?: string
  joinDate?: string
  user?: {
    id: number
    name?: string
    username?: string
    email?: string
    /** 售前团队接口返回形状：[{ role: { displayName } }] */
    userRoles?: { role?: { displayName?: string } }[]
    /** 项目团队接口返回形状：[{ displayName }]（后端已做一层映射） */
    roles?: { displayName?: string }[]
  }
}

export interface TeamUserOption {
  id: number
  name?: string
  username?: string
}

interface TeamMembersPanelProps {
  /** 成员列表（需包含 user.userRoles.role.displayName，由后端接口返回） */
  members: TeamMemberRow[]
  /** 可选择的用户（用于添加下拉） */
  users: TeamUserOption[]
  /** 多选添加成员 */
  onAdd: (userIds: number[]) => Promise<unknown> | unknown
  /** 移除成员 */
  onRemove: (memberId: number) => Promise<unknown> | unknown
  /** 禁用添加/移除（如项目已归档） */
  disabled?: boolean
}

/**
 * 团队成员管理面板（共享组件）
 *
 * 统一「项目详情 / 售前详情」的团队成员交互：
 * - 添加：弹窗多选用户，一次可加多人（已在职成员自动排除）
 * - 角色：不做选择 —— 直接展示成员在系统中的角色（userRoles.displayName）
 * - 移除：Popconfirm 确认
 */
export function TeamMembersPanel({ members, users, onAdd, onRemove, disabled }: TeamMembersPanelProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)

  const memberUserIds = new Set(members.map((m) => m.userId))
  const candidateUsers = users.filter((u) => !memberUserIds.has(u.id))

  const handleOpen = () => {
    setSelectedIds([])
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (selectedIds.length === 0) {
      message.warning('请选择要添加的成员')
      return
    }
    setSubmitting(true)
    try {
      await onAdd(selectedIds)
      message.success(`成功添加 ${selectedIds.length} 名成员`)
      setModalOpen(false)
    } catch (e: any) {
      message.error(e?.error || '添加失败')
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    {
      title: '成员',
      key: 'user',
      render: (_: unknown, m: TeamMemberRow) => (
        <span style={{ fontWeight: 600 }}>{m.user?.name || m.user?.username || '-'}</span>
      ),
    },
    {
      title: '邮箱',
      key: 'email',
      render: (_: unknown, m: TeamMemberRow) => m.user?.email || '-',
    },
    {
      title: '角色',
      key: 'role',
      render: (_: unknown, m: TeamMemberRow) => {
        // 兼容两种接口形状：项目团队返回 user.roles（已映射），售前团队返回 user.userRoles
        const raw = (m.user?.userRoles ?? m.user?.roles ?? []) as any[]
        const roles = raw
          .map((r) => r?.role?.displayName ?? r?.displayName)
          .filter(Boolean) as string[]
        if (roles.length === 0) return <Tag>—</Tag>
        return (
          <>
            {roles.map((r) => (
              <Tag key={r} color="blue">{r}</Tag>
            ))}
          </>
        )
      },
    },
    {
      title: '加入时间',
      key: 'joinedAt',
      render: (_: unknown, m: TeamMemberRow) => {
        const t = m.joinDate || m.createdAt
        return t ? dayjs(t).format('YYYY-MM-DD') : '-'
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_: unknown, m: TeamMemberRow) => (
        <Popconfirm
          title="确定要移除该成员吗？"
          disabled={disabled}
          onConfirm={async () => {
            try {
              await onRemove(m.id)
              message.success('已移除')
            } catch (e: any) {
              message.error(e?.error || '移除失败')
            }
          }}
        >
          <Button type="link" size="small" danger icon={<UserDeleteOutlined />} disabled={disabled}>
            移除
          </Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleOpen} disabled={disabled}>
          添加成员
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={members}
        rowKey="id"
        pagination={false}
        size="middle"
        locale={{ emptyText: '暂无团队成员' }}
      />

      <Modal
        title="添加团队成员"
        open={modalOpen}
        onOk={handleSubmit}
        confirmLoading={submitting}
        onCancel={() => setModalOpen(false)}
        okText="添加"
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: '#64748b' }}>
          可多选；角色取自成员的系统角色，无需手动指定。
        </div>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="搜索选择成员（可多选）"
          value={selectedIds}
          onChange={setSelectedIds}
          showSearch
          optionFilterProp="label"
          maxTagCount={5}
          options={candidateUsers.map((u) => ({
            value: u.id,
            label: `${u.name || u.username} (${u.username || u.id})`,
          }))}
        />
        {candidateUsers.length === 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#f59e0b' }}>所有用户都已在团队中</div>
        )}
      </Modal>
    </div>
  )
}
