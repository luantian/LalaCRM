# 工作日报精细化改进方案

## 📊 当前日报系统分析

### 现有功能
- ✅ 基础CRUD操作
- ✅ 简单筛选（用户、项目、日期、类型）
- ✅ 基础统计（月度报告数、总工时、按类型）
- ✅ CSV导出
- ✅ 数据权限过滤

### 当前数据模型
```prisma
model DailyReport {
  id            Int      @id @default(autoincrement())
  userId        Int
  user          User     @relation(fields: [userId], references: [id])
  reportDate    DateTime // 日报日期
  projectId     Int?     // 关联项目
  project       Project? @relation(fields: [projectId], references: [id])
  opportunityId Int?     // 关联商机
  type          DailyReportType @default(WORK) // 日报类型
  content       String   // 工作内容
  plan          String?  // 明日计划
  issues        String?  // 问题与困难
  hours         Decimal? @db.Decimal(4, 1) // 工作时长（小时）
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

---

## 🎯 精细化改进清单

### 一、核心功能增强

#### 1.1 日报状态管理
**现状**：日报创建即为最终状态，无状态流转

**改进**：
- 添加状态字段：DRAFT（草稿）、SUBMITTED（已提交）、APPROVED（已批准）、REJECTED（已拒绝）
- 状态流转规则：
  - DRAFT → SUBMITTED（提交）
  - SUBMITTED → APPROVED（批准）/ REJECTED（拒绝）
  - REJECTED → SUBMITTED（重新提交）
- 只有自己的日报可以编辑（DRAFT状态）
- 管理员/上级可以审批下属日报

**业务价值**：
- 规范日报提交流程
- 支持日报审核机制
- 追踪日报处理状态

#### 1.2 日报评论/批阅系统
**现状**：无评论功能，上级无法对日报进行点评

**改进**：
- 新增 DailyReportComment 模型
- 支持多级评论（回复）
- 评论权限：只有上级/管理员可以评论
- 评论通知：被评论时发送通知
- 评论统计：统计评论数量、最新评论内容

**数据模型**：
```prisma
model DailyReportComment {
  id          Int      @id @default(autoincrement())
  reportId    Int
  report      DailyReport @relation(fields: [reportId], references: [id], onDelete: Cascade)
  userId      Int
  user        User     @relation(fields: [userId], references: [id])
  content     String   // 评论内容
  parentId    Int?     // 父评论ID（用于回复）
  parent      DailyReportComment? @relation("CommentReplies", fields: [parentId], references: [id])
  replies     DailyReportComment[] @relation("CommentReplies")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([reportId])
  @@index([userId])
}
```

**业务价值**：
- 加强上下级沟通
- 工作指导与反馈
- 形成工作记录

#### 1.3 日报评分系统
**现状**：无评分机制

**改进**：
- 添加评分字段（1-5星）
- 评分权限：只有上级/管理员可以评分
- 评分统计：平均评分、评分趋势
- 评分应用：可作为绩效考核参考

**业务价值**：
- 量化工作质量
- 激励员工认真填写日报
- 为绩效考核提供依据

---

### 二、模板与自动化

#### 2.1 日报模板库
**现状**：所有日报格式统一，无模板

**改进**：
- 新增 DailyReportTemplate 模型
- 预设模板：
  - 日常工作模板
  - 售前支持模板
  - 项目实施模板
  - 会议记录模板
  - 培训总结模板
- 自定义模板：用户可创建个人模板
- 模板字段：标题、内容结构、必填项

**数据模型**：
```prisma
model DailyReportTemplate {
  id          Int      @id @default(autoincrement())
  name        String   // 模板名称
  type        DailyReportType // 适用类型
  content     String   // 模板内容（JSON格式）
  isPublic    Boolean  @default(false) // 是否公开
  userId      Int?     // 创建者（null表示系统模板）
  user        User?    @relation(fields: [userId], references: [id])
  useCount    Int      @default(0) // 使用次数
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([type])
  @@index([userId])
}
```

**业务价值**：
- 提高日报填写效率
- 统一日报格式
- 知识沉淀与共享

#### 2.2 周报/月报自动生成
**现状**：需要手动汇总日报

**改进**：
- 自动从日报生成周报（本周日报汇总）
- 自动从日报生成月报（本月日报汇总）
- 支持自定义汇总维度（按项目、按类型、按日期）
- 周报/月报可编辑后提交

**数据模型**：
```prisma
model WeeklyReport {
  id          Int      @id @default(autoincrement())
  userId      Int
  user        User     @relation(fields: [userId], references: [id])
  weekStart   DateTime // 周开始日期
  weekEnd     DateTime // 周结束日期
  summary     String   // 周总结
  highlights  String?  // 亮点工作
  issues      String?  // 问题与困难
  nextWeekPlan String? // 下周计划
  totalHours  Decimal  @db.Decimal(5, 1) // 总工时
  reportCount Int      // 日报数量
  status      ReportStatus @default(DRAFT)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([userId, weekStart])
}

model MonthlyReport {
  id          Int      @id @default(autoincrement())
  userId      Int
  user        User     @relation(fields: [userId], references: [id])
  year        Int      // 年份
  month       Int      // 月份
  summary     String   // 月总结
  achievements String? // 主要成就
  issues      String?  // 问题与困难
  nextMonthPlan String? // 下月计划
  totalHours  Decimal  @db.Decimal(6, 1) // 总工时
  reportCount Int      // 日报数量
  status      ReportStatus @default(DRAFT)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([userId, year, month])
}

enum ReportStatus {
  DRAFT      // 草稿
  SUBMITTED  // 已提交
  APPROVED   // 已批准
  REJECTED   // 已拒绝
}
```

**业务价值**：
- 减少重复工作
- 提高周报/月报效率
- 数据一致性

#### 2.3 日报提醒机制
**现状**：无提醒功能

**改进**：
- 每日提醒：未提交日报时发送提醒
- 提醒时间可配置（如：每天18:00）
- 提醒方式：站内通知、邮件（可选）
- 提醒统计：统计未提交日报的天数

**数据模型**：
```prisma
model DailyReportReminder {
  id          Int      @id @default(autoincrement())
  userId      Int
  user        User     @relation(fields: [userId], references: [id])
  reminderTime String  @default("18:00") // 提醒时间（HH:mm）
  isEnabled   Boolean  @default(true)    // 是否启用
  lastRemindedAt DateTime? // 最后提醒时间
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([userId])
}
```

**业务价值**：
- 提高日报提交率
- 培养良好工作习惯
- 减少遗漏

---

### 三、关联与扩展

#### 3.1 增强关联关系
**现状**：仅关联项目和商机

**改进**：
- 关联客户（customerId）
- 关联合同（contractId）
- 关联出差（businessTripId）
- 多关联支持（一个日报可关联多个对象）

**数据模型**：
```prisma
model DailyReportRelation {
  id          Int      @id @default(autoincrement())
  reportId    Int
  report      DailyReport @relation(fields: [reportId], references: [id], onDelete: Cascade)
  relationType String  // CUSTOMER/PROJECT/CONTRACT/TRIP/OPPORTUNITY
  relationId  Int      // 关联对象ID
  createdAt   DateTime @default(now())
  
  @@unique([reportId, relationType, relationId])
  @@index([reportId])
  @@index([relationType, relationId])
}
```

**业务价值**：
- 工作追溯更完整
- 便于统计分析
- 关联业务数据

#### 3.2 日报附件
**现状**：无附件功能

**改进**：
- 支持上传附件（图片、文档等）
- 附件大小限制（如：10MB）
- 附件类型限制（如：图片、PDF、Word、Excel）
- 附件预览功能

**数据模型**：
```prisma
model DailyReportFile {
  id          Int      @id @default(autoincrement())
  reportId    Int
  report      DailyReport @relation(fields: [reportId], references: [id], onDelete: Cascade)
  fileName    String   // 原始文件名
  filePath    String   // 存储路径
  fileSize    Int      // 文件大小（字节）
  fileType    String   // 文件类型（MIME）
  uploadedBy  Int      // 上传人
  uploadedAt  DateTime @default(now())
  
  @@index([reportId])
}
```

**业务价值**：
- 支持丰富内容形式
- 保留工作证据
- 便于后续查阅

#### 3.3 日报标签
**现状**：无标签系统

**改进**：
- 支持自定义标签
- 标签分类（工作类型、紧急程度、重要性等）
- 标签搜索
- 标签统计

**数据模型**：
```prisma
model DailyReportTag {
  id          Int      @id @default(autoincrement())
  reportId    Int
  report      DailyReport @relation(fields: [reportId], references: [id], onDelete: Cascade)
  tagName     String   // 标签名称
  createdAt   DateTime @default(now())
  
  @@unique([reportId, tagName])
  @@index([reportId])
  @@index([tagName])
}

model Tag {
  id          Int      @id @default(autoincrement())
  name        String   @unique // 标签名称
  color       String?  // 标签颜色
  useCount    Int      @default(0) // 使用次数
  createdAt   DateTime @default(now())
}
```

**业务价值**：
- 灵活分类日报
- 快速检索
- 数据分析

---

### 四、权限与可见性

#### 4.1 精细化权限控制
**现状**：基于数据权限，较简单

**改进**：
- 查看权限：
  - 自己的日报：始终可见
  - 下属的日报：直属上级可见
  - 部门的日报：部门负责人可见
  - 所有的日报：管理员可见
- 编辑权限：
  - 只能编辑自己的草稿日报
  - 管理员可以编辑所有日报
- 审批权限：
  - 直属上级可以审批下属日报
  - 管理员可以审批所有日报
- 评论权限：
  - 上级可以评论下属日报
  - 同级可以互相评论（可配置）

**业务价值**：
- 保护隐私
- 明确职责
- 规范流程

#### 4.2 日报可见范围设置
**现状**：无可见范围设置

**改进**：
- 用户可设置日报可见范围：
  - 仅自己
  - 直属上级
  - 部门同事
  - 指定人员
- 敏感日报可设为私密

**数据模型**：
```prisma
model DailyReportVisibility {
  id          Int      @id @default(autoincrement())
  reportId    Int
  report      DailyReport @relation(fields: [reportId], references: [id], onDelete: Cascade)
  visibilityType String // SELF/MANAGER/DEPARTMENT/CUSTOM
  userId      Int?     // CUSTOM类型时指定用户
  user        User?    @relation(fields: [userId], references: [id])
  createdAt   DateTime @default(now())
  
  @@index([reportId])
}
```

**业务价值**：
- 灵活控制可见性
- 保护敏感信息
- 个性化设置

---

### 五、统计与分析

#### 5.1 高级统计报表
**现状**：仅基础统计

**改进**：
- 提交率统计：按人员、按部门、按时间段
- 工时统计：按项目、按类型、按人员
- 质量统计：评分分布、评论数量
- 趋势分析：日报数量趋势、工时趋势
- 对比分析：部门对比、人员对比
- 异常分析：未提交日报统计、工时异常统计

**API端点**：
```
GET /api/daily-reports/stats/submission-rate  // 提交率统计
GET /api/daily-reports/stats/hours-analysis   // 工时分析
GET /api/daily-reports/stats/quality-metrics  // 质量指标
GET /api/daily-reports/stats/trend-analysis   // 趋势分析
GET /api/daily-reports/stats/comparison       // 对比分析
GET /api/daily-reports/stats/anomalies        // 异常分析
```

**业务价值**：
- 全面数据分析
- 发现问题
- 决策支持

#### 5.2 日报日历视图
**现状**：仅列表视图

**改进**：
- 日历视图展示日报
- 按日期快速查看日报
- 标记未提交日报的日期
- 支持月度/周度视图切换

**业务价值**：
- 直观查看日报分布
- 快速定位日报
- 发现提交规律

#### 5.3 日报搜索增强
**现状**：简单文本搜索

**改进**：
- 高级搜索：
  - 按日期范围
  - 按项目/客户/合同
  - 按类型/标签
  - 按状态
  - 按评分范围
  - 按工时范围
- 全文搜索：支持内容全文检索
- 搜索保存：保存常用搜索条件
- 搜索历史：记录搜索历史

**业务价值**：
- 快速定位日报
- 提高检索效率
- 个性化搜索

---

### 六、导出与归档

#### 6.1 多格式导出
**现状**：仅CSV导出

**改进**：
- Excel导出（.xlsx）：支持多Sheet、格式化
- PDF导出：支持模板、页眉页脚
- Word导出：支持模板
- 自定义导出字段
- 批量导出

**业务价值**：
- 满足不同场景需求
- 提升报告质量
- 便于分享

#### 6.2 日报归档
**现状**：无归档机制

**改进**：
- 自动归档：超过一定时间（如：6个月）自动归档
- 手动归档：用户可手动归档日报
- 归档日报只读
- 归档日报可搜索
- 归档统计

**数据模型**：
```prisma
model DailyReportArchive {
  id          Int      @id @default(autoincrement())
  originalId  Int      // 原日报ID
  userId      Int
  reportDate  DateTime
  type        DailyReportType
  content     String
  plan        String?
  issues      String?
  hours       Decimal?
  projectId   Int?
  archivedAt  DateTime @default(now())
  
  @@index([userId])
  @@index([reportDate])
}
```

**业务价值**：
- 优化数据库性能
- 保留历史记录
- 合规要求

---

### 七、用户体验优化

#### 7.1 日报批量操作
**现状**：单条操作

**改进**：
- 批量提交日报
- 批量删除日报
- 批量导出日报
- 批量设置状态

**业务价值**：
- 提高效率
- 减少重复操作

#### 7.2 日报收藏
**现状**：无收藏功能

**改进**：
- 收藏重要日报
- 收藏列表
- 快速访问收藏

**数据模型**：
```prisma
model DailyReportFavorite {
  id          Int      @id @default(autoincrement())
  userId      Int
  user        User     @relation(fields: [userId], references: [id])
  reportId    Int
  report      DailyReport @relation(fields: [reportId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
  
  @@unique([userId, reportId])
}
```

**业务价值**：
- 快速访问重要日报
- 个性化定制

#### 7.3 日报历史记录
**现状**：无版本历史

**改进**：
- 记录日报修改历史
- 查看历史版本
- 恢复历史版本（可选）

**数据模型**：
```prisma
model DailyReportHistory {
  id          Int      @id @default(autoincrement())
  reportId    Int
  report      DailyReport @relation(fields: [reportId], references: [id], onDelete: Cascade)
  version     Int      // 版本号
  content     String   // 修改后的内容
  plan        String?
  issues      String?
  hours       Decimal?
  changedBy   Int      // 修改人
  changedAt   DateTime @default(now())
  changeReason String? // 修改原因
  
  @@index([reportId])
  @@index([version])
}
```

**业务价值**：
- 追踪修改历史
- 审计需求
- 数据恢复

---

## 📋 实施优先级

### 第一阶段（1-2周）：核心功能
1. ✅ 日报状态管理
2. ✅ 日报评论/批阅
3. ✅ 日报评分系统

### 第二阶段（1-2周）：模板与自动化
4. ✅ 日报模板库
5. ✅ 周报/月报自动生成
6. ✅ 日报提醒机制

### 第三阶段（1-2周）：关联与扩展
7. ✅ 增强关联关系
8. ✅ 日报附件
9. ✅ 日报标签

### 第四阶段（1周）：权限与可见性
10. ✅ 精细化权限控制
11. ✅ 日报可见范围设置

### 第五阶段（1-2周）：统计与分析
12. ✅ 高级统计报表
13. ✅ 日报日历视图
14. ✅ 日报搜索增强

### 第六阶段（1周）：导出与归档
15. ✅ 多格式导出
16. ✅ 日报归档

### 第七阶段（1周）：用户体验
17. ✅ 日报批量操作
18. ✅ 日报收藏
19. ✅ 日报历史记录

---

## 🎯 关键建议

### 最重要的3个功能
1. **日报状态管理** - 规范流程基础
2. **日报评论/批阅** - 加强沟通
3. **周报/月报自动生成** - 提高效率

### 投入产出比最高的3个功能
1. **日报提醒机制** - 开发量小，效果明显
2. **日报模板库** - 一次开发，长期受益
3. **日报标签** - 灵活分类，快速检索

### 风险最高的缺失
1. **日报状态管理缺失** - 流程不规范
2. **日报评论缺失** - 缺乏反馈机制
3. **周报/月报手动** - 效率低下

---

## 📝 总结

当前日报系统**功能基础但不完善**，主要问题：
- ❌ 无状态管理，流程不规范
- ❌ 无评论批阅，缺乏沟通
- ❌ 无模板，效率低
- ❌ 无提醒，提交率低
- ❌ 统计简单，分析不足

**改进后预期效果**：
- ✅ 规范的日报流程
- ✅ 良好的沟通机制
- ✅ 高效的模板系统
- ✅ 智能的提醒机制
- ✅ 全面的统计分析
- ✅ 便捷的操作体验

**总体评估**：日报系统完善度可从 **75% 提升到 95%**
