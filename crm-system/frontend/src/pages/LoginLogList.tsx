import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Input,
  Select,
  Button,
  Table,
  Tag,
  DatePicker,
  Space,
  message,
} from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import api from '../services/api';

const { RangePicker } = DatePicker;

interface LoginLog {
  id: string;
  loginTime: string;
  username: string;
  status: 'SUCCESS' | 'FAILED';
  ip: string;
  browser: string;
  os: string;
  message: string;
}

interface Stats {
  todayLogin: number;
  successCount: number;
  failedCount: number;
}

const LoginLogList: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<LoginLog[]>([]);
  const [pagination, setPagination] = useState<{ current: number; pageSize: number; total: number }>({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [stats, setStats] = useState<Stats>({ todayLogin: 0, successCount: 0, failedCount: 0 });

  const [filters, setFilters] = useState<{
    username?: string;
    status?: string;
    dateRange?: [Dayjs, Dayjs] | null;
  }>({});

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/login-logs/stats');
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

        if (filters.username) params.username = filters.username;
        if (filters.status) params.status = filters.status;
        if (filters.dateRange && filters.dateRange.length === 2) {
          params.startDate = filters.dateRange[0].format('YYYY-MM-DD');
          params.endDate = filters.dateRange[1].format('YYYY-MM-DD');
        }

        const { data } = await api.get('/login-logs', { params });
        const payload = data.data || data;

        setDataSource(Array.isArray(payload.list) ? payload.list : (payload.records ?? []));
        setPagination({
          current: page,
          pageSize,
          total: payload.total ?? 0,
        });
      } catch {
        message.error('获取登录日志失败');
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

  const columns: ColumnsType<LoginLog> = [
    {
      title: '登录时间',
      dataIndex: 'loginTime',
      key: 'loginTime',
      width: 180,
      render: (text: string) => (text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 140,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        if (status === 'SUCCESS') return <Tag color="green">成功</Tag>;
        if (status === 'FAILED') return <Tag color="red">失败</Tag>;
        return <Tag>{status || '-'}</Tag>;
      },
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      key: 'ip',
      width: 140,
    },
    {
      title: '浏览器',
      dataIndex: 'browser',
      key: 'browser',
      width: 140,
      ellipsis: true,
    },
    {
      title: '操作系统',
      dataIndex: 'os',
      key: 'os',
      width: 140,
      ellipsis: true,
    },
    {
      title: '提示消息',
      dataIndex: 'message',
      key: 'message',
      width: 200,
      ellipsis: true,
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={24}>
          <Col span={8}>
            <Statistic title="今日登录" value={stats.todayLogin} />
          </Col>
          <Col span={8}>
            <Statistic title="成功" value={stats.successCount} valueStyle={{ color: '#52c41a' }} />
          </Col>
          <Col span={8}>
            <Statistic title="失败" value={stats.failedCount} valueStyle={{ color: '#ff4d4f' }} />
          </Col>
        </Row>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="用户名"
            value={filters.username}
            onChange={(e) => setFilters((prev) => ({ ...prev, username: e.target.value }))}
            style={{ width: 160 }}
            allowClear
          />
          <Select
            placeholder="状态"
            value={filters.status}
            onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
            style={{ width: 140 }}
            allowClear
            options={[
              { label: '全部', value: undefined },
              { label: '成功', value: 'SUCCESS' },
              { label: '失败', value: 'FAILED' },
            ]}
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

export default LoginLogList;
