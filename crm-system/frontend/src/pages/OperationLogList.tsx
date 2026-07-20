import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Input,
  Button,
  Table,
  Tag,
  Tooltip,
  DatePicker,
  Space,
  message,
} from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import api from '../services/api';

const { RangePicker } = DatePicker;

interface OperationLog {
  id: string;
  createdAt: string;
  userName: string;
  module: string;
  action: string;
  target: string;
  detail: string;
  ip: string;
  status: 'SUCCESS' | 'ERROR';
}

interface Stats {
  todayCount: number;
  weekCount: number;
}

const OperationLogList: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<OperationLog[]>([]);
  const [pagination, setPagination] = useState<{ current: number; pageSize: number; total: number }>({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [stats, setStats] = useState<Stats>({ todayCount: 0, weekCount: 0 });

  const [filters, setFilters] = useState<{
    module?: string;
    action?: string;
    dateRange?: [Dayjs, Dayjs] | null;
  }>({});

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/operation-logs/stats');
      setStats(data.data || data);
    } catch {
      // stats are non-critical
    }
  }, []);

  const fetchData = useCallback(
    async (page = 1, pageSize = 10) => {
      setLoading(true);
      try {
        const params: Record<string, any> = { page, pageSize };

        if (filters.module) params.module = filters.module;
        if (filters.action) params.action = filters.action;
        if (filters.dateRange && filters.dateRange.length === 2) {
          params.startDate = filters.dateRange[0].format('YYYY-MM-DD');
          params.endDate = filters.dateRange[1].format('YYYY-MM-DD');
        }

        const { data } = await api.get('/operation-logs', { params });
        const payload = data.data || data;

        setDataSource(Array.isArray(payload.list) ? payload.list : (payload.records ?? []));
        setPagination({
          current: page,
          pageSize,
          total: payload.total ?? 0,
        });
      } catch {
        message.error('获取操作日志失败');
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchData(1, pagination.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const handleTableChange = (pag: TablePaginationConfig) => {
    fetchData(pag.current ?? 1, pag.pageSize ?? 10);
  };

  const handleSearch = () => {
    fetchData(1, pagination.pageSize);
  };

  const handleReset = () => {
    setFilters({});
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const columns: ColumnsType<OperationLog> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (text: string) => (text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '操作人',
      dataIndex: 'userName',
      key: 'userName',
      width: 120,
    },
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 120,
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 120,
    },
    {
      title: '操作对象',
      dataIndex: 'target',
      key: 'target',
      width: 160,
      ellipsis: true,
    },
    {
      title: '详情',
      dataIndex: 'detail',
      key: 'detail',
      width: 220,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span>{text ? (text.length > 30 ? `${text.slice(0, 30)}...` : text) : '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      key: 'ip',
      width: 140,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => {
        if (status === 'SUCCESS') return <Tag color="green">SUCCESS</Tag>;
        if (status === 'ERROR') return <Tag color="red">ERROR</Tag>;
        return <Tag>{status || '-'}</Tag>;
      },
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={24}>
          <Col span={8}>
            <Statistic title="今日操作数" value={stats.todayCount} />
          </Col>
          <Col span={8}>
            <Statistic title="本周操作数" value={stats.weekCount} />
          </Col>
        </Row>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="模块"
            value={filters.module}
            onChange={(e) => setFilters((prev) => ({ ...prev, module: e.target.value }))}
            style={{ width: 160 }}
            allowClear
          />
          <Input
            placeholder="操作类型"
            value={filters.action}
            onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value }))}
            style={{ width: 160 }}
            allowClear
          />
          <RangePicker
            value={filters.dateRange as any}
            onChange={(dates) =>
              setFilters((prev) => ({ ...prev, dateRange: dates as [Dayjs, Dayjs] | null }))
            }
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            搜索
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            重置
          </Button>
        </Space>
      </Card>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={dataSource}
          loading={loading}
          bordered
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showTotal: (total) => `共 ${total} 条`,
          }}
          onChange={handleTableChange}
        />
      </Card>
    </div>
  );
};

export default OperationLogList;
