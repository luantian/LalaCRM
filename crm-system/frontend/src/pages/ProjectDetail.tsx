import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Descriptions, Tag, Tabs, Table, Button, Space, Statistic, Row, Col, Modal, Form, Input, Select, InputNumber, DatePicker, message, List, Popconfirm, Dropdown, Slider, Progress, Avatar, Empty, Image } from 'antd'
import { ArrowLeftOutlined, EditOutlined, PlusOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined, FileOutlined, MoreOutlined, EyeOutlined } from '@ant-design/icons'
import { getProjectDetail, createContract, updateContract, deleteContract, getProjectFiles, updateProject, getCustomers, getOrderItems, createOrderItem, updateOrderItem, deleteOrderItem, uploadOrderItemFiles, deleteOrderItemFile, downloadOrderItemFileUrl, getPayments, createPayment, updatePayment, deletePayment, getShipments, createShipment, updateShipment, deleteShipment, getProcurements, createProcurement, getProcurementItems, createProcurementItem, deleteProcurementItem, getProcurementPayments, createProcurementPayment, updateProcurementPayment, deleteProcurementPayment, getProjectNotes, createProjectNote, updateProjectNote, deleteProjectNote, uploadProjectNoteFiles, deleteProjectNoteFile, downloadProjectNoteFileUrl, getProjectTeam, addProjectTeamMember, removeProjectTeamMember, updateProjectTeamMember, getInvoices, createInvoice, getUsers, safeJsonParse } from '../services/api'
import dayjs from 'dayjs'

const { TextArea } = Input
const { RangePicker } = DatePicker

function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const user = safeJsonParse(localStorage.getItem('user'), {})

  // 合同管理状态
  const [contractModalVisible, setContractModalVisible] = useState(false)
  const [editingContract, setEditingContract] = useState<any>(null)
  const [contractForm] = Form.useForm()

  // 订货明细状态
  const [orderItems, setOrderItems] = useState<any[]>([])
  const [orderModalVisible, setOrderModalVisible] = useState(false)
  const [editingOrderItem, setEditingOrderItem] = useState<any>(null)
  const [orderForm] = Form.useForm()
  const [orderContractId, setOrderContractId] = useState<number | null>(null)
  const [orderUploading, setOrderUploading] = useState<Record<number, boolean>>({})

  // 付款记录状态
  const [payments, setPayments] = useState<any[]>([])
  const [paymentSummary, setPaymentSummary] = useState<any>({ totalPaid: 0, paymentCount: 0 })
  const [paymentModalVisible, setPaymentModalVisible] = useState(false)
  const [editingPayment, setEditingPayment] = useState<any>(null)
  const [paymentForm] = Form.useForm()
  const [paymentContractId, setPaymentContractId] = useState<number | null>(null)

  // 发货记录状态
  const [shipments, setShipments] = useState<any[]>([])
  const [shipmentModalVisible, setShipmentModalVisible] = useState(false)
  const [editingShipment, setEditingShipment] = useState<any>(null)
  const [shipmentForm] = Form.useForm()
  const [shipmentContractId, setShipmentContractId] = useState<number | null>(null)

  // 文件管理状态
  const [, setFiles] = useState<any[]>([])
  const currentPhase = 'PRE_SALES'

  // 采购管理状态
  const [procurements, setProcurements] = useState<any[]>([])
  const [procurementModalVisible, setProcurementModalVisible] = useState(false)
  const [procurementForm] = Form.useForm()
  const [currentProcurement, setCurrentProcurement] = useState<any>(null)
  const [procurementItems, setProcurementItems] = useState<any[]>([])
  const [procItemModalVisible, setProcItemModalVisible] = useState(false)
  const [procItemForm] = Form.useForm()
  const [procPayments, setProcPayments] = useState<any[]>([])
  const [procPaymentModalVisible, setProcPaymentModalVisible] = useState(false)
  const [editingProcPayment, setEditingProcPayment] = useState<any>(null)
  const [procPaymentForm] = Form.useForm()

  // 项目编辑状态
  const [projectModalVisible, setProjectModalVisible] = useState(false)
  const [projectForm] = Form.useForm()
  const [customers, setCustomers] = useState<any[]>([])

  // 项目备注状态 (removed - notes/versions UI removed)

  // 基本信息-信息记录状态
  const [infoRecords, setInfoRecords] = useState<any[]>([])
  const [infoModalVisible, setInfoModalVisible] = useState(false)
  const [infoForm] = Form.useForm()
  const [infoFiles, setInfoFiles] = useState<File[]>([])
  const [infoSubmitting, setInfoSubmitting] = useState(false)
  const [editingInfoRecord, setEditingInfoRecord] = useState<any>(null)

  // 版本记录状态 (removed - versions UI removed)

  // 项目团队状态
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [teamModalVisible, setTeamModalVisible] = useState(false)
  const [editingMember, setEditingMember] = useState<any>(null)
  const [teamForm] = Form.useForm()
  const [allUsers, setAllUsers] = useState<any[]>([])

  // 项目发票状态
  const [projectInvoices, setProjectInvoices] = useState<any[]>([])
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false)
  const [invoiceForm] = Form.useForm()

  // 文件预览状态
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string } | null>(null)

  // 基本信息-信息记录（提前定义以便在 useEffect 中调用）
  const fetchInfoRecords = async () => {
    try {
      const res: any = await getProjectNotes(parseInt(id!))
      setInfoRecords(Array.isArray(res) ? res : res.data || [])
    } catch (e) { console.error('获取信息记录失败:', e) }
  }

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const data = await getProjectDetail(parseInt(id!))
        setProject(data)
      } catch (error) {
        console.error('获取项目详情失败:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchDetail()
  }, [id])

  const fetchCustomers = async () => {
    try {
      const response: any = await getCustomers({ pageSize: 1000 })
      setCustomers(response.data || [])
    } catch (error) { console.error('获取客户列表失败:', error) }
  }

  const fetchFiles = async () => {
    try {
      const data: any = await getProjectFiles(parseInt(id!), currentPhase)
      setFiles(data || [])
    } catch (error) { console.error('获取文件列表失败:', error) }
  }

  useEffect(() => {
    if (id) {
      fetchFiles()
      fetchCustomers()
      fetchInfoRecords()
    }
  }, [id])

  useEffect(() => {
    if (id) fetchFiles()
  }, [currentPhase])

  const refreshProject = async () => {
    try {
      const data = await getProjectDetail(parseInt(id!))
      setProject(data)
    } catch (error) { console.error('刷新项目详情失败:', error) }
  }

  // ===== 项目编辑 =====
  const handleEditProject = () => {
    projectForm.setFieldsValue({
      ...project,
      budget: project.budget ? Number(project.budget) : null,
      progress: project.progress || 0,
      dateRange: (project.startDate && project.endDate) ? [dayjs(project.startDate), dayjs(project.endDate)] : undefined,
      acceptanceDate: project.acceptanceDate ? dayjs(project.acceptanceDate) : null
    })
    setProjectModalVisible(true)
  }

  const handleProjectSubmit = async () => {
    try {
      const values = await projectForm.validateFields()
      const [startDate, endDate] = values.dateRange || []
      await updateProject(parseInt(id!), {
        ...values,
        startDate: startDate ? startDate.toDate() : null,
        endDate: endDate ? endDate.toDate() : null,
        acceptanceDate: values.acceptanceDate ? values.acceptanceDate.toDate() : null
      })
      message.success('项目更新成功')
      setProjectModalVisible(false)
      refreshProject()
    } catch (error) { message.error('更新失败') }
  }

  if (loading || !project) return <div>加载中...</div>

  const statusConfig: Record<string, { text: string; color: string }> = {
    PENDING: { text: '待开始', color: 'default' }, IN_PROGRESS: { text: '进行中', color: 'processing' },
    COMPLETED: { text: '已完成', color: 'success' }, CANCELLED: { text: '已取消', color: 'error' }
  }
  const projectStatus = statusConfig[project.status] || { text: project.status, color: 'default' }

  const contractStatusConfig: Record<string, { text: string; color: string }> = {
    DRAFT: { text: '草稿', color: 'default' }, PENDING: { text: '待审批', color: 'warning' },
    ACTIVE: { text: '生效中', color: 'success' }, EXPIRED: { text: '已过期', color: 'error' },
    CANCELLED: { text: '已取消', color: 'error' }
  }

  const totalContractAmount = project.contracts?.reduce((s: number, c: any) => s + Number(c.amount), 0) || 0
  const contractCount = project.contracts?.length || 0

  // ===== 合同管理 =====
  const handleAddContract = () => { setEditingContract(null); contractForm.resetFields(); contractForm.setFieldsValue({ status: 'DRAFT' }); setContractModalVisible(true) }
  const handleEditContract = (c: any) => {
    setEditingContract(c)
    contractForm.setFieldsValue({ ...c, amount: Number(c.amount), signDate: c.signDate ? dayjs(c.signDate) : null, dateRange: (c.startDate && c.endDate) ? [dayjs(c.startDate), dayjs(c.endDate)] : undefined })
    setContractModalVisible(true)
  }
  const handleDeleteContract = async (cid: number) => { await deleteContract(cid); message.success('删除成功'); refreshProject() }
  const handleContractSubmit = async () => {
    try {
      const values = await contractForm.validateFields()
      const [cStartDate, cEndDate] = values.dateRange || []
      const data = { ...values, name: values.name || `${project.name} - 合同`, customerId: project.customerId, projectId: parseInt(id!), signDate: values.signDate ? values.signDate.toDate() : null, startDate: cStartDate ? cStartDate.toDate() : null, endDate: cEndDate ? cEndDate.toDate() : null }
      if (editingContract) { await updateContract(editingContract.id, data); message.success('更新成功') }
      else { await createContract(data); message.success('创建成功') }
      setContractModalVisible(false); refreshProject()
    } catch (error) { message.error('操作失败') }
  }

  // ===== 订货明细 =====
  const fetchOrderItems = async (contractId: number) => {
    try { const data: any = await getOrderItems(contractId); setOrderItems(data || []) } catch (e) { console.error(e) }
  }
  const handleOrderSubmit = async () => {
    try {
      const values = await orderForm.validateFields()
      const data = { ...values, contractId: orderContractId, unitPrice: Number(values.unitPrice), totalPrice: Number(values.quantity) * Number(values.unitPrice), deliveryDate: values.deliveryDate ? values.deliveryDate.toDate() : null }
      if (editingOrderItem) { await updateOrderItem(editingOrderItem.id, data); message.success('更新成功') }
      else { await createOrderItem(data); message.success('添加成功') }
      setOrderModalVisible(false); if (orderContractId) fetchOrderItems(orderContractId)
    } catch (error) { message.error('操作失败') }
  }
  const handleOrderFileUpload = async (orderItemId: number, fileList: FileList) => {
    setOrderUploading(prev => ({ ...prev, [orderItemId]: true }))
    try { await uploadOrderItemFiles(orderItemId, fileList); message.success('上传成功'); if (orderContractId) fetchOrderItems(orderContractId) }
    catch (e: any) { message.error(e?.error || e?.message || '上传失败') } finally { setOrderUploading(prev => ({ ...prev, [orderItemId]: false })) }
  }
  const handleOrderFileDelete = async (orderItemId: number, fileId: number) => {
    try { await deleteOrderItemFile(orderItemId, fileId); message.success('删除成功'); if (orderContractId) fetchOrderItems(orderContractId) }
    catch (e) { message.error('删除失败') }
  }

  // ===== 付款记录 =====
  const fetchPayments = async (contractId: number) => {
    try { const res: any = await getPayments(contractId); setPayments(res.data || []); setPaymentSummary(res.summary || {}) } catch (e) { console.error(e) }
  }
  const handlePaymentSubmit = async () => {
    try {
      const values = await paymentForm.validateFields()
      const data = { ...values, contractId: paymentContractId, amount: Number(values.amount), paymentDate: values.paymentDate.toDate() }
      if (editingPayment) { await updatePayment(editingPayment.id, data); message.success('更新成功') }
      else { await createPayment(data); message.success('添加成功') }
      setPaymentModalVisible(false); if (paymentContractId) fetchPayments(paymentContractId)
    } catch (error) { message.error('操作失败') }
  }

  // ===== 发货记录 =====
  const fetchShipments = async (contractId: number) => {
    try { const data: any = await getShipments(contractId); setShipments(data || []) } catch (e) { console.error(e) }
  }
  const handleShipmentSubmit = async () => {
    try {
      const values = await shipmentForm.validateFields()
      const data = { ...values, contractId: shipmentContractId, shipDate: values.shipDate.toDate(), receiveDate: values.receiveDate ? values.receiveDate.toDate() : null }
      if (editingShipment) { await updateShipment(editingShipment.id, data); message.success('更新成功') }
      else { await createShipment(data); message.success('添加成功') }
      setShipmentModalVisible(false); if (shipmentContractId) fetchShipments(shipmentContractId)
    } catch (error) { message.error('操作失败') }
  }

  // ===== 采购管理 =====

  // 判断文件是否可预览
  const isPreviewableFile = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'pdf'].includes(ext || '')
  }

  // 打开文件预览
  const handlePreviewFile = (fileId: number, fileName: string) => {
    const token = localStorage.getItem('token')
    const url = `${import.meta.env.VITE_API_URL || '/api'}/projects/files/${fileId}/preview`
    fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) throw new Error('预览失败')
        return r.blob()
      })
      .then(blob => {
        const previewUrl = window.URL.createObjectURL(blob)
        const ext = fileName.split('.').pop()?.toLowerCase()
        if (previewFile?.url) window.URL.revokeObjectURL(previewFile.url)
        setPreviewFile({ url: previewUrl, name: fileName, type: ext || '' })
        setPreviewVisible(true)
      })
      .catch(() => message.error('预览失败'))
  }

  // 打开备注文件预览
  const handlePreviewNoteFile = (fileId: number, fileName: string) => {
    const token = localStorage.getItem('token')
    const url = `${import.meta.env.VITE_API_URL || '/api'}/project-notes/notes/files/${fileId}/preview`
    fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) throw new Error('预览失败')
        return r.blob()
      })
      .then(blob => {
        const previewUrl = window.URL.createObjectURL(blob)
        const ext = fileName.split('.').pop()?.toLowerCase()
        if (previewFile?.url) window.URL.revokeObjectURL(previewFile.url)
        setPreviewFile({ url: previewUrl, name: fileName, type: ext || '' })
        setPreviewVisible(true)
      })
      .catch(() => message.error('预览失败'))
  }

  // ===== 表格列 =====
  const contractColumns = [
    { title: '合同名称', dataIndex: 'name', key: 'name' },
    { title: '金额', dataIndex: 'amount', key: 'amount', render: (v: number) => <span style={{ color: '#1890ff', fontWeight: 'bold' }}>{Number(v)}元</span> },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => { const c = contractStatusConfig[s] || { text: s, color: 'default' }; return <Tag color={c.color}>{c.text}</Tag> } },
    { title: '签订日期', dataIndex: 'signDate', key: 'signDate', render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    { title: '操作', key: 'action', width: 60, render: (_: any, r: any) => (
      <Dropdown menu={{ items: [
        { key: 'edit', icon: <EditOutlined />, label: '编辑', onClick: () => handleEditContract(r) },
        { type: 'divider' },
        { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: () => handleDeleteContract(r.id) },
      ]}}><Button type="text" icon={<MoreOutlined />} /></Dropdown>
    ) }
  ]

  const orderColumns = [
    { title: '产品/服务', dataIndex: 'productName', key: 'productName' },
    { title: '规格', dataIndex: 'spec', key: 'spec', render: (v: string) => v || '-' },
    { title: '数量', dataIndex: 'quantity', key: 'quantity' },
    { title: '单位', dataIndex: 'unit', key: 'unit' },
    { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', render: (v: number) => `${Number(v)}元` },
    { title: '总价', dataIndex: 'totalPrice', key: 'totalPrice', render: (v: number) => <span style={{ color: '#1890ff' }}>{Number(v)}元</span> },
    { title: '联系人', dataIndex: 'contactName', key: 'contactName', render: (v: string) => v || '-' },
    { title: '联系电话', dataIndex: 'contactPhone', key: 'contactPhone', render: (v: string) => v || '-' },
    { title: '交货日期', dataIndex: 'deliveryDate', key: 'deliveryDate', render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    { title: '操作', key: 'action', width: 60, render: (_: any, r: any) => (
      <Dropdown menu={{ items: [
        { key: 'edit', icon: <EditOutlined />, label: '编辑', onClick: () => { setEditingOrderItem(r); orderForm.setFieldsValue({ ...r, unitPrice: Number(r.unitPrice), deliveryDate: r.deliveryDate ? dayjs(r.deliveryDate) : null }); setOrderModalVisible(true) } },
        { type: 'divider' },
        { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: async () => { await deleteOrderItem(r.id); if (orderContractId) fetchOrderItems(orderContractId) } },
      ]}}><Button type="text" icon={<MoreOutlined />} /></Dropdown>
    ) }
  ]

  const paymentColumns = [
    { title: '金额', dataIndex: 'amount', key: 'amount', render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 'bold' }}>{Number(v)}元</span> },
    { title: '付款类型', dataIndex: 'paymentType', key: 'paymentType', render: (t: string) => ({ ADVANCE: '预付款', PROGRESS: '进度款', FINAL: '尾款', FULL: '全款' }[t] || t) },
    { title: '付款方式', dataIndex: 'paymentMethod', key: 'paymentMethod', render: (v: string) => v || '-' },
    { title: '付款日期', dataIndex: 'paymentDate', key: 'paymentDate', render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'RECEIVED' ? 'success' : s === 'CONFIRMED' ? 'processing' : 'default'}>{{ PENDING: '待付款', CONFIRMED: '已确认', RECEIVED: '已到账' }[s] || s}</Tag> },
    { title: '发票号', dataIndex: 'invoiceNo', key: 'invoiceNo', render: (v: string) => v || '-' },
    { title: '操作', key: 'action', width: 60, render: (_: any, r: any) => (
      <Dropdown menu={{ items: [
        { key: 'edit', icon: <EditOutlined />, label: '编辑', onClick: () => { setEditingPayment(r); paymentForm.setFieldsValue({ ...r, amount: Number(r.amount), paymentDate: dayjs(r.paymentDate) }); setPaymentModalVisible(true) } },
        { type: 'divider' },
        { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: async () => { await deletePayment(r.id); if (paymentContractId) fetchPayments(paymentContractId) } },
      ]}}><Button type="text" icon={<MoreOutlined />} /></Dropdown>
    ) }
  ]

  const shipmentColumns = [
    { title: '发货日期', dataIndex: 'shipDate', key: 'shipDate', render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    { title: '物流公司', dataIndex: 'logisticsCompany', key: 'logisticsCompany', render: (v: string) => v || '-' },
    { title: '物流单号', dataIndex: 'logisticsNo', key: 'logisticsNo', render: (v: string) => v || '-' },
    { title: '发货内容', dataIndex: 'content', key: 'content', render: (v: string) => v || '-' },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', render: (v: number) => v || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'DELIVERED' ? 'success' : s === 'IN_TRANSIT' ? 'processing' : s === 'SHIPPED' ? 'blue' : 'default'}>{{ PENDING: '待发货', SHIPPED: '已发货', IN_TRANSIT: '运输中', DELIVERED: '已签收' }[s] || s}</Tag> },
    { title: '签收日期', dataIndex: 'receiveDate', key: 'receiveDate', render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    { title: '签收人', dataIndex: 'receiver', key: 'receiver', render: (v: string) => v || '-' },
    { title: '操作', key: 'action', width: 60, render: (_: any, r: any) => (
      <Dropdown menu={{ items: [
        { key: 'edit', icon: <EditOutlined />, label: '编辑', onClick: () => { setEditingShipment(r); shipmentForm.setFieldsValue({ ...r, shipDate: dayjs(r.shipDate), receiveDate: r.receiveDate ? dayjs(r.receiveDate) : null }); setShipmentModalVisible(true) } },
        { type: 'divider' },
        { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true, onClick: async () => { await deleteShipment(r.id); if (shipmentContractId) fetchShipments(shipmentContractId) } },
      ]}}><Button type="text" icon={<MoreOutlined />} /></Dropdown>
    ) }
  ]

  // ===== 采购管理 =====
  const fetchProcurements = async () => {
    try {
      const res: any = await getProcurements({ projectId: parseInt(id!) })
      setProcurements(res.data || [])
    } catch (e) { console.error(e) }
  }

  // ===== 基本信息-信息记录 =====
  const handleInfoSubmit = async () => {
    try {
      const values = await infoForm.validateFields()
      setInfoSubmitting(true)
      if (editingInfoRecord) {
        // 编辑模式
        await updateProjectNote(editingInfoRecord.id, { ...values, projectId: parseInt(id!) })
        // 上传新选择的附件
        if (infoFiles.length > 0) {
          await uploadProjectNoteFiles(editingInfoRecord.id, infoFiles)
        }
        message.success('更新成功')
      } else {
        // 新增模式
        const title = dayjs().format('YYYY-MM-DD HH:mm')
        const res: any = await createProjectNote({ ...values, title, projectId: parseInt(id!), noteType: 'GENERAL' })
        const noteId = res.id
        if (infoFiles.length > 0) {
          await uploadProjectNoteFiles(noteId, infoFiles)
        }
        message.success('添加成功')
      }
      setInfoModalVisible(false)
      infoForm.resetFields()
      setInfoFiles([])
      setEditingInfoRecord(null)
      fetchInfoRecords()
    } catch (error) { message.error('操作失败') }
    finally { setInfoSubmitting(false) }
  }
  const handleEditInfoRecord = (record: any) => {
    setEditingInfoRecord(record)
    infoForm.setFieldsValue({ content: record.content })
    setInfoModalVisible(true)
  }
  const handleDeleteInfoRecord = async (noteId: number) => {
    try { await deleteProjectNote(noteId); message.success('删除成功'); fetchInfoRecords() }
    catch (e) { message.error('删除失败') }
  }

  // ===== 项目团队 =====
  const fetchTeamMembers = async () => {
    try {
      const res: any = await getProjectTeam(parseInt(id!))
      setTeamMembers(res || [])
    } catch (e) { console.error('获取团队成员失败:', e) }
  }
  const fetchAllUsers = async () => {
    try {
      const res: any = await getUsers({ pageSize: 1000 })
      setAllUsers(res.data || res || [])
    } catch {}
  }
  const handleAddTeamMember = () => {
    setEditingMember(null)
    teamForm.resetFields()
    fetchAllUsers()
    setTeamModalVisible(true)
  }
  const handleEditTeamMember = (member: any) => {
    setEditingMember(member)
    teamForm.setFieldsValue(member)
    fetchAllUsers()
    setTeamModalVisible(true)
  }
  const handleTeamSubmit = async () => {
    try {
      const values = await teamForm.validateFields()
      if (editingMember) {
        await updateProjectTeamMember(parseInt(id!), editingMember.id, values)
        message.success('更新成功')
      } else {
        // 多选：批量添加
        const userIds = Array.isArray(values.userId) ? values.userId : [values.userId]
        for (const uid of userIds) {
          await addProjectTeamMember(parseInt(id!), { userId: uid, projectRole: values.projectRole, responsibility: values.responsibility })
        }
        message.success(`成功添加 ${userIds.length} 名成员`)
      }
      setTeamModalVisible(false)
      teamForm.resetFields()
      fetchTeamMembers()
    } catch {}
  }
  const handleRemoveMember = async (memberId: number) => {
    Modal.confirm({
      title: '确认移除', content: '确定将该成员从项目团队中移除？',
      onOk: async () => {
        try {
          await removeProjectTeamMember(parseInt(id!), memberId)
          message.success('已移除')
          fetchTeamMembers()
        } catch { message.error('移除失败') }
      }
    })
  }

  // ===== 项目发票 =====
  const fetchProjectInvoices = async () => {
    try {
      const res: any = await getInvoices({ projectId: parseInt(id!), pageSize: 100 })
      setProjectInvoices(res.data || [])
    } catch (e) { console.error('获取项目发票失败:', e) }
  }
  const handleAddInvoice = () => {
    invoiceForm.resetFields()
    invoiceForm.setFieldsValue({ invoiceType: 'EXPENSE', category: 'VAT_SPECIAL', taxRate: 13, status: 'PENDING' })
    setInvoiceModalVisible(true)
  }
  const handleInvoiceSubmit = async () => {
    try {
      const values = await invoiceForm.validateFields()
      await createInvoice({ ...values, projectId: parseInt(id!), invoiceDate: values.invoiceDate ? values.invoiceDate.toDate() : null })
      message.success('创建成功')
      setInvoiceModalVisible(false)
      fetchProjectInvoices()
    } catch {}
  }
  const handleAddProcurement = () => { procurementForm.resetFields(); setProcurementModalVisible(true) }
  const handleProcurementSubmit = async () => {
    try {
      const values = await procurementForm.validateFields()
      await createProcurement({ ...values, projectId: parseInt(id!), expectedDate: values.expectedDate ? values.expectedDate.toDate() : null })
      message.success('采购单创建成功')
      setProcurementModalVisible(false)
      fetchProcurements()
    } catch (e) { message.error('操作失败') }
  }
  const handleViewProcurement = async (proc: any) => {
    setCurrentProcurement(proc)
    const items: any = await getProcurementItems(proc.id)
    setProcurementItems(items || [])
    fetchProcPayments(proc.id)
  }
  const handleProcItemSubmit = async () => {
    try {
      const values = await procItemForm.validateFields()
      await createProcurementItem(currentProcurement.id, { ...values, unitPrice: Number(values.unitPrice), quantity: Number(values.quantity) })
      message.success('采购明细添加成功')
      setProcItemModalVisible(false)
      handleViewProcurement(currentProcurement)
    } catch (e) { message.error('操作失败') }
  }
  const fetchProcPayments = async (procurementId: number) => {
    try {
      const res: any = await getProcurementPayments(procurementId)
      setProcPayments(res?.data?.data || res?.data || [])
    } catch { setProcPayments([]) }
  }
  const handleProcPaymentSubmit = async () => {
    try {
      const values = await procPaymentForm.validateFields()
      const payload = { ...values, procurementId: currentProcurement.id, paymentDate: values.paymentDate ? values.paymentDate.toDate() : null }
      if (editingProcPayment) {
        await updateProcurementPayment(editingProcPayment.id, payload)
        message.success('付款记录更新成功')
      } else {
        await createProcurementPayment(payload)
        message.success('付款记录添加成功')
      }
      setProcPaymentModalVisible(false)
      fetchProcPayments(currentProcurement.id)
    } catch (e) { message.error('操作失败') }
  }

  // ===== Tab 项 =====
  const tabItems = [
    { key: 'info', label: '基本信息', children: (
      <div>
        <Card title="项目详情">
          <Descriptions column={2} bordered>
            <Descriptions.Item label="项目名称">{project.name}</Descriptions.Item>
            <Descriptions.Item label="客户">{project.customer?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={projectStatus.color}>{projectStatus.text}</Tag></Descriptions.Item>
            <Descriptions.Item label="预算">{project.budget ? `${Number(project.budget)}元` : '-'}</Descriptions.Item>
            <Descriptions.Item label="开始日期">{project.startDate ? dayjs(project.startDate).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
            <Descriptions.Item label="结束日期">{project.endDate ? dayjs(project.endDate).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
            <Descriptions.Item label="负责人">{project.owner?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{dayjs(project.createdAt).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>{project.description || '-'}</Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="信息记录" style={{ marginTop: 16 }} extra={
          <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => { infoForm.resetFields(); setEditingInfoRecord(null); setInfoModalVisible(true) }}>添加信息</Button>
        }>
          {infoRecords.length === 0 ? (
            <Empty description="暂无信息记录" />
          ) : (
            <List
              dataSource={infoRecords}
              renderItem={(record: any) => {
                const isOwner = record.user?.id === user.id
                return (
                <List.Item
                  actions={[
                    isOwner && (
                      <Button key="edit" type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditInfoRecord(record)} />
                    ),
                    isOwner && (
                      <Popconfirm key="del" title="确定删除此记录？" onConfirm={() => handleDeleteInfoRecord(record.id)}>
                        <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                      </Popconfirm>
                    )
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    avatar={<Avatar style={{ backgroundColor: '#1890ff' }}>{record.user?.name?.[0] || '?'}</Avatar>}
                    title={
                      <div>
                        <span style={{ fontWeight: 600 }}>{record.user?.name || '未知'}</span>
                        <span style={{ color: '#888', fontWeight: 'normal', marginLeft: 12, fontSize: 12 }}>{dayjs(record.createdAt).format('YYYY-MM-DD HH:mm')}</span>
                      </div>
                    }
                    description={
                      <div>
                        <div style={{ whiteSpace: 'pre-wrap', color: '#333', marginBottom: 4 }}>{record.content || ''}</div>
                        {record.files && record.files.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            {record.files.map((file: any) => (
                              <span key={file.id} style={{ display: 'inline-flex', alignItems: 'center', marginRight: 12, padding: '2px 8px', background: '#f5f5f5', borderRadius: 4, fontSize: 12 }}>
                                <FileOutlined style={{ marginRight: 4 }} />
                                {isPreviewableFile(file.fileName) ? (
                                  <a onClick={() => handlePreviewNoteFile(file.id, file.fileName)} style={{ cursor: 'pointer', color: '#1890ff' }}>
                                    {file.fileName}
                                    <EyeOutlined style={{ marginLeft: 4 }} />
                                  </a>
                                ) : (
                                  <a href={downloadProjectNoteFileUrl(file.id)} download={file.fileName} style={{ color: '#1890ff' }}>
                                    {file.fileName}
                                    <DownloadOutlined style={{ marginLeft: 4 }} />
                                  </a>
                                )}
                                <span style={{ color: '#999', marginLeft: 4 }}>({(file.fileSize / 1024).toFixed(1)}KB)</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    }
                  />
                </List.Item>
                );
              }}
            />
          )}
        </Card>
      </div>
    )},
    { key: 'contracts', label: `合同管理 (${contractCount})`, children: (
      <div>
        <div style={{ marginBottom: 16 }}><Button type="primary" icon={<PlusOutlined />} onClick={handleAddContract}>新增合同</Button></div>
        <Table
          columns={contractColumns}
          dataSource={project.contracts || []}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: '暂无合同' }}
          expandable={{
            expandedRowRender: (_record: any) => (
              <Tabs
                defaultActiveKey="orders"
                items={[
                  { key: 'orders', label: '订货明细', children: (
                    <div>
                      <div style={{ marginBottom: 12 }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingOrderItem(null); orderForm.resetFields(); setOrderModalVisible(true) }}>添加明细</Button>
                      </div>
                      <Table columns={orderColumns} dataSource={orderItems} rowKey="id" pagination={false} size="small" locale={{ emptyText: '暂无订货明细' }}
                        expandable={{
                          expandedRowRender: (or: any) => {
                            const fileInputRef = { current: null as HTMLInputElement | null }
                            return (
                              <div style={{ padding: '8px 0' }}>
                                <div style={{ marginBottom: 12 }}>
                                  <input type="file" multiple ref={el => { fileInputRef.current = el }} style={{ display: 'none' }} onChange={e => { if (e.target.files && e.target.files.length > 0) { handleOrderFileUpload(or.id, e.target.files); e.target.value = '' } }} />
                                  <Button icon={<UploadOutlined />} loading={orderUploading[or.id]} size="small" onClick={() => fileInputRef.current?.click()}>上传附件</Button>
                                </div>
                                {or.files && or.files.length > 0 ? (
                                  <List size="small" dataSource={or.files} renderItem={(file: any) => (
                                    <List.Item actions={[
                                      isPreviewableFile(file.fileName) && (
                                        <Button key="preview" type="text" size="small" icon={<EyeOutlined />} onClick={() => handlePreviewFile(file.id, file.fileName)} />
                                      ),
                                      <a key="dl" href={downloadOrderItemFileUrl(file.id)} target="_blank" rel="noreferrer"><Button type="text" size="small" icon={<DownloadOutlined />} /></a>,
                                      <Popconfirm key="del" title="确定删除？" onConfirm={() => handleOrderFileDelete(or.id, file.id)}>
                                        <Button type="text" size="small" icon={<DeleteOutlined />} danger />
                                      </Popconfirm>
                                    ].filter(Boolean)}>
                                      <List.Item.Meta avatar={<FileOutlined />} title={file.fileName} description={`${(file.fileSize / 1024).toFixed(1)} KB · ${dayjs(file.uploadedAt).format('YYYY-MM-DD HH:mm')}`} />
                                    </List.Item>
                                  )} />
                                ) : <span style={{ color: '#999' }}>暂无附件</span>}
                              </div>
                            )
                          },
                          rowExpandable: () => true
                        }}
                      />
                    </div>
                  )},
                  { key: 'payments', label: '付款记录', children: (
                    <div>
                      <div style={{ marginBottom: 12 }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingPayment(null); paymentForm.resetFields(); paymentForm.setFieldsValue({ paymentType: 'PROGRESS', status: 'PENDING' }); setPaymentModalVisible(true) }}>添加付款</Button>
                        {paymentSummary.totalPaid > 0 && <span style={{ marginLeft: 16 }}><Statistic title="已付款总额" value={paymentSummary.totalPaid} precision={2} suffix="元" valueStyle={{ color: '#52c41a' }} /></span>}
                      </div>
                      <Table columns={paymentColumns} dataSource={payments} rowKey="id" pagination={false} size="small" locale={{ emptyText: '暂无付款记录' }} />
                    </div>
                  )},
                  { key: 'shipments', label: '发货记录', children: (
                    <div>
                      <div style={{ marginBottom: 12 }}>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingShipment(null); shipmentForm.resetFields(); shipmentForm.setFieldsValue({ status: 'SHIPPED' }); setShipmentModalVisible(true) }}>添加发货</Button>
                      </div>
                      <Table columns={shipmentColumns} dataSource={shipments} rowKey="id" pagination={false} size="small" locale={{ emptyText: '暂无发货记录' }} />
                    </div>
                  )}
                ]}
              />
            ),
            onExpand: (expanded: boolean, record: any) => {
              if (expanded) {
                setOrderContractId(record.id)
                setPaymentContractId(record.id)
                setShipmentContractId(record.id)
                fetchOrderItems(record.id)
                fetchPayments(record.id)
                fetchShipments(record.id)
              }
            }
          }}
        />
      </div>
    )},
    { key: 'procurements', label: '采购管理', children: (
      <div>
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { handleAddProcurement(); fetchProcurements() }}>新增采购单</Button>
        </div>
        <Table
          dataSource={procurements}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: '暂无采购单' }}
          expandable={{
            expandedRowRender: (record: any) => (
              <Tabs size="small" defaultActiveKey="items" items={[
                { key: 'items', label: '采购明细', children: (
                  <div>
                    <div style={{ marginBottom: 12 }}>
                      <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { setCurrentProcurement(record); procItemForm.resetFields(); setProcItemModalVisible(true) }}>添加设备/材料</Button>
                    </div>
                    <Table
                      size="small"
                      dataSource={procurementItems}
                      rowKey="id"
                      pagination={false}
                      locale={{ emptyText: '暂无采购明细' }}
                      columns={[
                        { title: '名称', dataIndex: 'name', key: 'name' },
                        { title: '规格', dataIndex: 'spec', key: 'spec', render: (v: string) => v || '-' },
                        { title: '数量', dataIndex: 'quantity', key: 'quantity' },
                        { title: '单位', dataIndex: 'unit', key: 'unit' },
                        { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', render: (v: number) => `${Number(v)}元` },
                        { title: '总价', dataIndex: 'totalPrice', key: 'totalPrice', render: (v: number) => <span style={{ color: '#1890ff' }}>{Number(v)}元</span> },
                        { title: '操作', key: 'action', width: 60, render: (_: any, r: any) => (
                          <Popconfirm title="确定删除?" onConfirm={async () => { await deleteProcurementItem(r.id); handleViewProcurement(record) }}>
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        )}
                      ]}
                      summary={(data) => {
                        const total = data.reduce((s: number, i: any) => s + Number(i.totalPrice), 0)
                        return <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={5}><strong>合计</strong></Table.Summary.Cell><Table.Summary.Cell index={1}><strong style={{ color: '#f5222d' }}>{total}元</strong></Table.Summary.Cell><Table.Summary.Cell index={2} /></Table.Summary.Row>
                      }}
                    />
                  </div>
                )},
                { key: 'payments', label: '付款记录', children: (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      {procPayments.length > 0 && (
                        <div style={{ padding: '6px 12px', background: '#f6ffed', borderRadius: 6, fontSize: 13 }}>
                          <span>已付：<strong style={{ color: '#f5222d' }}>{procPayments.reduce((s, p) => s + Number(p.amount), 0)}元</strong></span>
                          {record.totalAmount && <span style={{ marginLeft: 12 }}>待付：<strong style={{ color: '#faad14' }}>{Number(record.totalAmount) - procPayments.reduce((s, p) => s + Number(p.amount), 0)}元</strong></span>}
                        </div>
                      )}
                      <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { setCurrentProcurement(record); setEditingProcPayment(null); procPaymentForm.resetFields(); procPaymentForm.setFieldsValue({ paymentType: 'PROGRESS', status: 'PENDING' }); setProcPaymentModalVisible(true) }}>添加付款</Button>
                    </div>
                    <Table
                      size="small"
                      dataSource={procPayments}
                      rowKey="id"
                      pagination={false}
                      locale={{ emptyText: '暂无付款记录' }}
                      columns={[
                        { title: '金额', dataIndex: 'amount', render: (v: number) => <span style={{ color: '#f5222d', fontWeight: 'bold' }}>{Number(v)}元</span> },
                        { title: '类型', dataIndex: 'paymentType', render: (t: string) => ({ ADVANCE: '预付款', PROGRESS: '进度款', FINAL: '尾款', FULL: '全款' }[t] || t) },
                        { title: '方式', dataIndex: 'paymentMethod', render: (v: string) => v || '-' },
                        { title: '日期', dataIndex: 'paymentDate', render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
                        { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={s === 'RECEIVED' ? 'success' : s === 'CONFIRMED' ? 'processing' : 'default'}>{{ PENDING: '待付款', CONFIRMED: '已确认', RECEIVED: '已到账' }[s] || s}</Tag> },
                        { title: '操作', key: 'action', width: 80, render: (_: any, r: any) => (
                          <Space>
                            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setCurrentProcurement(record); setEditingProcPayment(r); procPaymentForm.setFieldsValue({ ...r, amount: Number(r.amount), paymentDate: dayjs(r.paymentDate) }); setProcPaymentModalVisible(true) }} />
                            <Popconfirm title="确定删除?" onConfirm={async () => { await deleteProcurementPayment(r.id); fetchProcPayments(record.id) }}>
                              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        )}
                      ]}
                    />
                  </div>
                )}
              ]} />
            ),
            onExpand: (expanded: boolean, record: any) => {
              if (expanded) {
                handleViewProcurement(record)
              }
            }
          }}
          columns={[
            { title: '采购标题', dataIndex: 'title', key: 'title' },
            { title: '供应商', dataIndex: 'vendor', key: 'vendor', render: (v: string) => v || '-' },
            { title: '总金额', dataIndex: 'totalAmount', key: 'totalAmount', render: (v: any) => v ? `${Number(v)}元` : '-' },
            { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'RECEIVED' ? 'success' : s === 'IN_TRANSIT' ? 'processing' : s === 'ORDERED' ? 'blue' : 'default'}>{{ PLANNED: '计划中', ORDERED: '已下单', IN_TRANSIT: '运输中', RECEIVED: '已到货', CANCELLED: '已取消' }[s] || s}</Tag> },
            { title: '预计到货', dataIndex: 'expectedDate', key: 'expectedDate', render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
          ]}
        />
      </div>
    )},
    { key: 'team', label: '团队成员', children: (
      <div>
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { handleAddTeamMember(); fetchTeamMembers() }}>添加成员</Button>
        </div>
        <Table
          columns={[
            { title: '姓名', key: 'name', render: (_: any, r: any) => r.user?.name || '-' },
            { title: '邮箱', key: 'email', render: (_: any, r: any) => r.user?.email || '-' },
            { title: '角色', dataIndex: 'projectRole', key: 'projectRole',
              render: (v: string) => {
                const map: Record<string, string> = { MANAGER: '项目经理', DEVELOPER: '开发', TESTER: '测试', TECH_LEAD: '技术负责人', SALES: '销售', BUSINESS: '商务', OTHER: '其他' }
                return map[v] || v
              }
            },
            { title: '职责', dataIndex: 'responsibility', key: 'responsibility', ellipsis: true },
            { title: '加入时间', dataIndex: 'joinDate', key: 'joinDate', render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
            { title: '操作', key: 'action', width: 100, render: (_: any, r: any) => (
              <Dropdown menu={{ items: [
                { key: 'edit', icon: <EditOutlined />, label: '编辑', onClick: () => handleEditTeamMember(r) },
                { type: 'divider' },
                { key: 'remove', icon: <DeleteOutlined />, label: '移除', danger: true, onClick: () => handleRemoveMember(r.id) },
              ]}}><Button type="text" icon={<MoreOutlined />} /></Dropdown>
            )}
          ]}
          dataSource={teamMembers} rowKey="id" pagination={false}
          locale={{ emptyText: '暂无团队成员，点击"添加成员"开始组建项目团队' }}
        />
      </div>
    )},
    { key: 'invoices', label: '发票管理', children: (
      <div>
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { handleAddInvoice(); fetchProjectInvoices() }}>新建发票</Button>
        </div>
        <Table
          columns={[
            { title: '发票号', dataIndex: 'invoiceNo', key: 'invoiceNo' },
            { title: '类型', dataIndex: 'invoiceType', key: 'invoiceType', width: 80,
              render: (v: string) => v === 'INCOME' ? <Tag color="blue">出项</Tag> : <Tag color="green">进项</Tag>
            },
            { title: '价税合计', dataIndex: 'totalAmount', key: 'totalAmount', render: (v: number) => `¥${Number(v).toLocaleString()}` },
            { title: '对方单位', dataIndex: 'partyName', key: 'partyName', ellipsis: true },
            { title: '状态', dataIndex: 'status', key: 'status', width: 100,
              render: (v: string) => {
                const map: Record<string, { t: string; c: string }> = { PENDING: { t: '待处理', c: 'default' }, ISSUED: { t: '已处理', c: 'processing' }, CONFIRMED: { t: '已认证', c: 'success' }, CANCELLED: { t: '已作废', c: 'error' } }
                const s = map[v] || { t: v, c: 'default' }
                return <Tag color={s.c}>{s.t}</Tag>
              }
            },
            { title: '开票日期', dataIndex: 'invoiceDate', key: 'invoiceDate', render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
          ]}
          dataSource={projectInvoices} rowKey="id" pagination={false}
          locale={{ emptyText: '该项目暂无发票记录' }}
          summary={() => {
            const income = projectInvoices.filter((i: any) => i.invoiceType === 'INCOME').reduce((s: number, i: any) => s + Number(i.totalAmount), 0)
            const expense = projectInvoices.filter((i: any) => i.invoiceType === 'EXPENSE').reduce((s: number, i: any) => s + Number(i.totalAmount), 0)
            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2}><strong>汇总</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={1}><Tag color="blue">出项: ¥{income.toLocaleString()}</Tag></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} colSpan={2}><Tag color="green">进项: ¥{expense.toLocaleString()}</Tag></Table.Summary.Cell>
                  <Table.Summary.Cell index={3}><strong>差额: ¥{(income - expense).toLocaleString()}</strong></Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )
          }}
        />
      </div>
    )}
  ]

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')} style={{ marginBottom: 16 }}>返回列表</Button>

      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col><h2 style={{ margin: 0 }}>{project.name}</h2><p style={{ margin: '8px 0 0', color: '#666' }}>{project.customer?.name || '暂无客户'}</p></Col>
          <Col><Space><Tag color={projectStatus.color} style={{ fontSize: 14, padding: '4px 12px' }}>{projectStatus.text}</Tag><Button type="primary" icon={<EditOutlined />} onClick={handleEditProject}>编辑</Button></Space></Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}><Card><Statistic title="项目预算" value={project.budget ? Number(project.budget) : 0} precision={2} valueStyle={{ color: '#1890ff' }} suffix="元" /></Card></Col>
        <Col xs={24} sm={8}><Card><Statistic title="合同总额" value={totalContractAmount} precision={2} valueStyle={{ color: '#52c41a' }} suffix="元" /></Card></Col>
        <Col xs={24} sm={8}><Card title="项目进度"><Progress percent={project.progress || 0} status={project.progress >= 100 ? 'success' : 'active'} /></Card></Col>
      </Row>

      <Card><Tabs items={tabItems} /></Card>

      {/* 项目编辑 Modal */}
      <Modal title="编辑项目" open={projectModalVisible} onOk={handleProjectSubmit} onCancel={() => setProjectModalVisible(false)} width={600}>
        <Form form={projectForm} layout="vertical">
          <Form.Item name="name" label="项目名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="customerId" label="客户" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children">{customers.map(c => <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="status" label="状态"><Select><Select.Option value="PENDING">待开始</Select.Option><Select.Option value="IN_PROGRESS">进行中</Select.Option><Select.Option value="COMPLETED">已完成</Select.Option><Select.Option value="CANCELLED">已取消</Select.Option></Select></Form.Item>
          <Form.Item name="budget" label="预算"><InputNumber style={{ width: '100%' }} precision={2} /></Form.Item>
          <Form.Item name="dateRange" label="项目周期"><RangePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="acceptanceDate" label="调试验收时间"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="progress" label="当前进度"><Slider marks={{ 0: '0%', 25: '25%', 50: '50%', 75: '75%', 100: '100%' }} /></Form.Item>
          <Form.Item name="description" label="描述"><TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      {/* 合同 Modal */}
      <Modal title={editingContract ? '编辑合同' : '新增合同'} open={contractModalVisible} onOk={handleContractSubmit} onCancel={() => setContractModalVisible(false)} width={600}>
        <Form form={contractForm} layout="vertical">
          <Form.Item name="name" label="合同名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="amount" label="合同金额" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} precision={2} /></Form.Item>
          <Form.Item name="status" label="状态"><Select><Select.Option value="DRAFT">草稿</Select.Option><Select.Option value="PENDING">待审批</Select.Option><Select.Option value="ACTIVE">生效中</Select.Option><Select.Option value="EXPIRED">已过期</Select.Option><Select.Option value="CANCELLED">已取消</Select.Option></Select></Form.Item>
          <Form.Item name="signDate" label="签订日期"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="dateRange" label="合同周期"><RangePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="content" label="合同内容"><TextArea rows={4} /></Form.Item>
        </Form>
      </Modal>

      {/* 订货明细 Modal */}
      <Modal title={editingOrderItem ? '编辑明细' : '添加订货明细'} open={orderModalVisible} onOk={handleOrderSubmit} onCancel={() => setOrderModalVisible(false)} width={600}>
        <Form form={orderForm} layout="vertical">
          <Row gutter={16}><Col span={16}><Form.Item name="productName" label="产品/服务名称" rules={[{ required: true }]}><Input /></Form.Item></Col><Col span={8}><Form.Item name="spec" label="规格型号"><Input /></Form.Item></Col></Row>
          <Row gutter={16}><Col span={8}><Form.Item name="quantity" label="数量" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col><Col span={8}><Form.Item name="unit" label="单位"><Input placeholder="个/套/台" /></Form.Item></Col><Col span={8}><Form.Item name="unitPrice" label="单价" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} precision={2} /></Form.Item></Col></Row>
          <Row gutter={16}><Col span={12}><Form.Item name="contactName" label="联系人"><Input placeholder="联系人姓名" /></Form.Item></Col><Col span={12}><Form.Item name="contactPhone" label="联系电话"><Input placeholder="手机号" /></Form.Item></Col></Row>
          <Form.Item name="deliveryDate" label="交货日期"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="remarks" label="备注"><TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 付款记录 Modal */}
      <Modal title={editingPayment ? '编辑付款' : '添加付款记录'} open={paymentModalVisible} onOk={handlePaymentSubmit} onCancel={() => setPaymentModalVisible(false)} width={600}>
        <Form form={paymentForm} layout="vertical">
          <Row gutter={16}><Col span={12}><Form.Item name="amount" label="付款金额" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} precision={2} /></Form.Item></Col><Col span={12}><Form.Item name="paymentDate" label="付款日期" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col></Row>
          <Row gutter={16}><Col span={12}><Form.Item name="paymentType" label="付款类型"><Select><Select.Option value="ADVANCE">预付款</Select.Option><Select.Option value="PROGRESS">进度款</Select.Option><Select.Option value="FINAL">尾款</Select.Option><Select.Option value="FULL">全款</Select.Option></Select></Form.Item></Col><Col span={12}><Form.Item name="paymentMethod" label="付款方式"><Input placeholder="银行转账/支票/现金" /></Form.Item></Col></Row>
          <Row gutter={16}><Col span={12}><Form.Item name="status" label="状态"><Select><Select.Option value="PENDING">待付款</Select.Option><Select.Option value="CONFIRMED">已确认</Select.Option><Select.Option value="RECEIVED">已到账</Select.Option></Select></Form.Item></Col><Col span={12}><Form.Item name="invoiceNo" label="发票号"><Input /></Form.Item></Col></Row>
          <Form.Item name="remarks" label="备注"><TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 发货记录 Modal */}
      <Modal title={editingShipment ? '编辑发货' : '添加发货记录'} open={shipmentModalVisible} onOk={handleShipmentSubmit} onCancel={() => setShipmentModalVisible(false)} width={600}>
        <Form form={shipmentForm} layout="vertical">
          <Row gutter={16}><Col span={12}><Form.Item name="shipDate" label="发货日期" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col><Col span={12}><Form.Item name="status" label="状态"><Select><Select.Option value="PENDING">待发货</Select.Option><Select.Option value="SHIPPED">已发货</Select.Option><Select.Option value="IN_TRANSIT">运输中</Select.Option><Select.Option value="DELIVERED">已签收</Select.Option></Select></Form.Item></Col></Row>
          <Row gutter={16}><Col span={12}><Form.Item name="logisticsCompany" label="物流公司"><Input /></Form.Item></Col><Col span={12}><Form.Item name="logisticsNo" label="物流单号"><Input /></Form.Item></Col></Row>
          <Row gutter={16}><Col span={16}><Form.Item name="content" label="发货内容"><Input /></Form.Item></Col><Col span={8}><Form.Item name="quantity" label="数量"><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col></Row>
          <Row gutter={16}><Col span={12}><Form.Item name="receiveDate" label="签收日期"><DatePicker style={{ width: '100%' }} /></Form.Item></Col><Col span={12}><Form.Item name="receiver" label="签收人"><Input /></Form.Item></Col></Row>
          <Form.Item name="remarks" label="备注"><TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 采购单 Modal */}
      <Modal title="新增采购单" open={procurementModalVisible} onOk={handleProcurementSubmit} onCancel={() => setProcurementModalVisible(false)} width={600}>
        <Form form={procurementForm} layout="vertical">
          <Form.Item name="title" label="采购标题" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="vendor" label="供应商"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="expectedDate" label="预计到货日期"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="status" label="状态" initialValue="PLANNED">
            <Select>
              <Select.Option value="PLANNED">计划中</Select.Option>
              <Select.Option value="ORDERED">已下单</Select.Option>
              <Select.Option value="IN_TRANSIT">运输中</Select.Option>
              <Select.Option value="RECEIVED">已到货</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="remarks" label="备注"><TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 采购明细添加 Modal */}
      <Modal title="添加采购明细" open={procItemModalVisible} onOk={handleProcItemSubmit} onCancel={() => setProcItemModalVisible(false)}>
        <Form form={procItemForm} layout="vertical">
          <Row gutter={16}>
            <Col span={16}><Form.Item name="name" label="设备/材料名称" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="spec" label="规格型号"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="quantity" label="数量" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>
            <Col span={8}><Form.Item name="unit" label="单位"><Input placeholder="个/台/套" /></Form.Item></Col>
            <Col span={8}><Form.Item name="unitPrice" label="单价" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} precision={2} /></Form.Item></Col>
          </Row>
          <Form.Item name="remarks" label="备注"><TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 采购付款 Modal */}
      <Modal title={editingProcPayment ? '编辑付款' : '添加付款'} open={procPaymentModalVisible} onOk={handleProcPaymentSubmit} onCancel={() => setProcPaymentModalVisible(false)} width={600}>
        <Form form={procPaymentForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}><Form.Item name="amount" label="付款金额" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} precision={2} /></Form.Item></Col>
            <Col span={12}><Form.Item name="paymentDate" label="付款日期" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="paymentType" label="付款类型"><Select><Select.Option value="ADVANCE">预付款</Select.Option><Select.Option value="PROGRESS">进度款</Select.Option><Select.Option value="FINAL">尾款</Select.Option><Select.Option value="FULL">全款</Select.Option></Select></Form.Item></Col>
            <Col span={12}><Form.Item name="paymentMethod" label="付款方式"><Input placeholder="银行转账/支票/现金" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="status" label="状态"><Select><Select.Option value="PENDING">待付款</Select.Option><Select.Option value="CONFIRMED">已确认</Select.Option><Select.Option value="RECEIVED">已到账</Select.Option></Select></Form.Item></Col>
            <Col span={12}><Form.Item name="invoiceNo" label="发票号"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="remarks" label="备注"><TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 基本信息-添加/编辑信息 Modal */}
      <Modal title={editingInfoRecord ? "编辑信息" : "添加信息"} open={infoModalVisible} onOk={handleInfoSubmit} onCancel={() => { setInfoModalVisible(false); setInfoFiles([]); setEditingInfoRecord(null); infoForm.resetFields() }} width={500} confirmLoading={infoSubmitting}>
        <Form form={infoForm} layout="vertical">
          <Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入内容' }]}>
            <TextArea rows={4} placeholder="信息内容" />
          </Form.Item>
          <Form.Item label="附件">
            {/* 显示已上传的附件 */}
            {editingInfoRecord && editingInfoRecord.files && editingInfoRecord.files.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>已上传附件：</div>
                {editingInfoRecord.files.map((file: any) => (
                  <div key={file.id} style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', background: '#f5f5f5', borderRadius: 4, marginBottom: 4, fontSize: 12 }}>
                    <FileOutlined style={{ marginRight: 6, color: '#1890ff' }} />
                    {isPreviewableFile(file.fileName) ? (
                      <a onClick={() => handlePreviewNoteFile(file.id, file.fileName)} style={{ cursor: 'pointer', color: '#1890ff', flex: 1 }}>
                        {file.fileName}
                        <EyeOutlined style={{ marginLeft: 4 }} />
                      </a>
                    ) : (
                      <a href={downloadProjectNoteFileUrl(file.id)} download={file.fileName} style={{ color: '#1890ff', flex: 1 }}>
                        {file.fileName}
                        <DownloadOutlined style={{ marginLeft: 4 }} />
                      </a>
                    )}
                    <span style={{ color: '#999', marginRight: 8 }}>{(file.fileSize / 1024).toFixed(1)}KB</span>
                    <Popconfirm title="确定删除此附件？" onConfirm={async () => {
                      try {
                        await deleteProjectNoteFile(editingInfoRecord.id, file.id)
                        message.success('删除成功')
                        // 立即更新本地状态，移除已删除的文件
                        setEditingInfoRecord((prev: any) => ({
                          ...prev,
                          files: prev.files.filter((f: any) => f.id !== file.id)
                        }))
                        fetchInfoRecords()
                      } catch (e) { message.error('删除失败') }
                    }}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </div>
                ))}
              </div>
            )}
            {/* 上传新附件 */}
            <input type="file" multiple id="info-file-input" style={{ display: 'none' }} onChange={e => {
              if (e.target.files) {
                setInfoFiles(prev => [...prev, ...Array.from(e.target.files!)])
                e.target.value = ''
              }
            }} />
            <Button icon={<UploadOutlined />} onClick={() => document.getElementById('info-file-input')?.click()}>选择附件（可多选）</Button>
            {infoFiles.length > 0 && (
              <div style={{ marginTop: 8, maxHeight: 150, overflowY: 'auto' }}>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>待上传附件：</div>
                {infoFiles.map((file, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', background: '#f5f5f5', borderRadius: 4, marginBottom: 4, fontSize: 12 }}>
                    <FileOutlined style={{ marginRight: 6, color: '#1890ff' }} />
                    <span style={{ flex: 1 }}>{file.name}</span>
                    <span style={{ color: '#999', marginRight: 8 }}>{(file.size / 1024).toFixed(1)}KB</span>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setInfoFiles(prev => prev.filter((_, i) => i !== idx))} />
                  </div>
                ))}
              </div>
            )}
          </Form.Item>
        </Form>
      </Modal>

      {/* 团队成员 Modal */}
      <Modal title={editingMember ? '编辑成员' : '添加团队成员'} open={teamModalVisible} onOk={handleTeamSubmit} onCancel={() => { setTeamModalVisible(false); teamForm.resetFields() }}>
        <Form form={teamForm} layout="vertical">
          <Form.Item name="userId" label="选择成员" rules={[{ required: true, message: '请选择成员' }]}>
            <Select
              mode={editingMember ? undefined : 'multiple'}
              showSearch
              optionFilterProp="children"
              placeholder={editingMember ? '搜索选择成员' : '可多选，搜索选择成员'}
              disabled={!!editingMember}
              maxTagCount={5}
            >
              {allUsers.filter((u: any) => !editingMember && !teamMembers.some((m: any) => m.userId === u.id)).map((u: any) => (
                <Select.Option key={u.id} value={u.id}>{u.name} ({u.username})</Select.Option>
              ))}
              {editingMember && allUsers.map((u: any) => (
                <Select.Option key={u.id} value={u.id}>{u.name} ({u.username})</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="projectRole" label="项目角色" initialValue="DEVELOPER">
            <Select>
              <Select.Option value="MANAGER">项目经理</Select.Option>
              <Select.Option value="TECH_LEAD">技术负责人</Select.Option>
              <Select.Option value="DEVELOPER">开发工程师</Select.Option>
              <Select.Option value="TESTER">测试工程师</Select.Option>
              <Select.Option value="SALES">销售</Select.Option>
              <Select.Option value="BUSINESS">商务</Select.Option>
              <Select.Option value="OTHER">其他</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="responsibility" label="职责描述"><TextArea rows={2} placeholder="描述该成员在项目中的职责" /></Form.Item>
        </Form>
      </Modal>

      {/* 发票 Modal */}
      <Modal title="新建发票" open={invoiceModalVisible} onOk={handleInvoiceSubmit} onCancel={() => setInvoiceModalVisible(false)}>
        <Form form={invoiceForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}><Form.Item name="invoiceNo" label="发票号码" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="invoiceType" label="类型" rules={[{ required: true }]}>
              <Select><Select.Option value="INCOME">出项（开给客户）</Select.Option><Select.Option value="EXPENSE">进项（供应商开出）</Select.Option></Select>
            </Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="amount" label="不含税金额" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} precision={2} /></Form.Item></Col>
            <Col span={8}><Form.Item name="taxRate" label="税率(%)"><InputNumber style={{ width: '100%' }} precision={2} /></Form.Item></Col>
            <Col span={8}><Form.Item name="category" label="类别"><Select>
              <Select.Option value="VAT_SPECIAL">增值税专票</Select.Option>
              <Select.Option value="VAT_NORMAL">增值税普票</Select.Option>
              <Select.Option value="VAT_ELECTRONIC">电子发票</Select.Option>
              <Select.Option value="RECEIPT">收据</Select.Option>
              <Select.Option value="OTHER">其他</Select.Option>
            </Select></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="partyName" label="对方单位"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="invoiceDate" label="开票日期"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="remarks" label="备注"><TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 文件预览 Modal */}
      <Modal
        title={previewFile?.name || '文件预览'}
        open={previewVisible}
        onCancel={() => { if (previewFile?.url) window.URL.revokeObjectURL(previewFile.url); setPreviewVisible(false); setPreviewFile(null) }}
        footer={[
          <Button key="close" onClick={() => { if (previewFile?.url) window.URL.revokeObjectURL(previewFile.url); setPreviewVisible(false); setPreviewFile(null) }}>关闭</Button>
        ]}
        width="80%"
        style={{ top: 20 }}
      >
        {previewFile && (
          <div style={{ textAlign: 'center', minHeight: 400 }}>
            {['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(previewFile.type) ? (
              <Image
                src={previewFile.url}
                alt={previewFile.name}
                style={{ maxWidth: '100%', maxHeight: '70vh' }}
                preview={false}
              />
            ) : previewFile.type === 'pdf' ? (
              <iframe
                src={previewFile.url}
                style={{ width: '100%', height: '70vh', border: 'none' }}
                title={previewFile.name}
              />
            ) : (
              <div style={{ padding: 40, color: '#999' }}>不支持预览此文件格式</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default ProjectDetail
