import type React from 'react'
import {
  DashboardOutlined, HomeOutlined, AppstoreOutlined, SettingOutlined,
  UserOutlined, TeamOutlined, SafetyOutlined, AuditOutlined,
  DollarOutlined, AccountBookOutlined, ShopOutlined, ShoppingCartOutlined,
  ProjectOutlined, ContainerOutlined, ScheduleOutlined, FileTextOutlined,
  CarOutlined, FundOutlined, BarChartOutlined, PieChartOutlined,
  MailOutlined, PhoneOutlined, MessageOutlined, SendOutlined,
  EnvironmentOutlined, GlobalOutlined, CloudOutlined, DatabaseOutlined,
  ToolOutlined, BuildOutlined, CodeOutlined, BugOutlined,
  BellOutlined, InboxOutlined, SearchOutlined, FilterOutlined,
  LockOutlined, KeyOutlined, SecurityScanOutlined, CheckCircleOutlined,
  ClockCircleOutlined, StarOutlined, HeartOutlined, FireOutlined,
  RocketOutlined, ThunderboltOutlined, CrownOutlined, TrophyOutlined,
  CameraOutlined, VideoCameraOutlined, PrinterOutlined, RobotOutlined,
  FlagOutlined, GiftOutlined,
  BankOutlined, InsuranceOutlined, SoundOutlined, WifiOutlined,
  SwapOutlined, UploadOutlined, DownloadOutlined, DesktopOutlined,
  MenuOutlined, ApartmentOutlined, BookOutlined, FileSearchOutlined,
  LoginOutlined, MoneyCollectOutlined,
} from '@ant-design/icons'

// Ant Design 图标组件类型（兼容 ForwardRefExoticComponent）
type IconComponentType = React.ComponentType<any>

const iconMap: Record<string, IconComponentType> = {
  DashboardOutlined, HomeOutlined, AppstoreOutlined, SettingOutlined,
  UserOutlined, TeamOutlined, SafetyOutlined, AuditOutlined,
  DollarOutlined, AccountBookOutlined, ShopOutlined, ShoppingCartOutlined,
  ProjectOutlined, ContainerOutlined, ScheduleOutlined, FileTextOutlined,
  CarOutlined, FundOutlined, BarChartOutlined, PieChartOutlined,
  MailOutlined, PhoneOutlined, MessageOutlined, SendOutlined,
  EnvironmentOutlined, GlobalOutlined, CloudOutlined, DatabaseOutlined,
  ToolOutlined, BuildOutlined, CodeOutlined, BugOutlined,
  BellOutlined, InboxOutlined, SearchOutlined, FilterOutlined,
  LockOutlined, KeyOutlined, SecurityScanOutlined, CheckCircleOutlined,
  ClockCircleOutlined, StarOutlined, HeartOutlined, FireOutlined,
  RocketOutlined, ThunderboltOutlined, CrownOutlined, TrophyOutlined,
  CameraOutlined, VideoCameraOutlined, PrinterOutlined, RobotOutlined,
  FlagOutlined, GiftOutlined,
  BankOutlined, InsuranceOutlined, SoundOutlined, WifiOutlined,
  SwapOutlined, UploadOutlined, DownloadOutlined, DesktopOutlined,
  MenuOutlined, ApartmentOutlined, BookOutlined, FileSearchOutlined,
  LoginOutlined, MoneyCollectOutlined,
}

export const availableIconList = Object.keys(iconMap)

export function getIcon(name: string): IconComponentType | undefined {
  if (!name) return undefined
  return iconMap[name]
}
