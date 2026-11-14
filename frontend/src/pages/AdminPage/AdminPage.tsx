// The Admin page has two parts:
// A form to replace all slots (POST /reset).
// A table of current slots (GET /slots).

// Frontend validation on this page:

// Slot ID: required, only letters, numbers, - or _, and not repeated.
// Doctor: required, not only spaces.
// End: must be after start.
// At least one slot must exist.
// Example: Start 14:00, End 13:00 → the form shows "End must be after start" and does not send anything.

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Row,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import toast from "react-hot-toast";
import styles from "./AdminPage.module.css";
import { api, errorMessage } from "../../lib/api";
import { fmt } from "../../lib/format";

interface SlotItem {
  id: string;
  provider: string;
  start: string | Dayjs;
  end: string | Dayjs;
  available?: boolean;
}

interface AdminFormValues {
  slots: {
    id: string;
    provider: string;
    start: Dayjs;
    end: Dayjs;
  }[];
}

interface SlotsApiResponse {
  slots: SlotItem[];
}

interface ResetApiResponse {
  slots_created: number;
}

const SAMPLE_SLOTS: SlotItem[] = [
  {
    id: "s4",
    provider: "Dr Ade",
    start: "2026-12-10T13:00:00Z",
    end: "2026-12-10T13:30:00Z",
  },
  {
    id: "s5",
    provider: "Dr Ade",
    start: "2026-12-10T14:00:00Z",
    end: "2026-12-10T14:30:00Z",
  },
  {
    id: "s6",
    provider: "Dr Ade",
    start: "2026-12-10T15:00:00Z",
    end: "2026-12-10T15:30:00Z",
  },
];

const idRules = [
  { required: true, message: "Enter an ID" },
  { pattern: /^[A-Za-z0-9_-]+$/, message: "Use only letters, numbers, - or _" },
  ({ getFieldValue }: { getFieldValue: (name: any) => any }) => ({
    validator(_: any, value: string) {
      const slotsList = (getFieldValue("slots") || []) as { id?: string }[];
      const ids = slotsList.map((s) => (s?.id || "").trim());
      if (!value || ids.filter((id) => id === value.trim()).length < 2)
        return Promise.resolve();
      return Promise.reject(new Error("This ID is used more than once"));
    },
  }),
];

// Rule: end must be after start (for one row)
const endRules = (index: number) => [
  { required: true, message: "Pick an end time" },
  ({ getFieldValue }: { getFieldValue: (name: any) => any }) => ({
    validator(_: any, value: Dayjs) {
      const start = getFieldValue(["slots", index, "start"]) as Dayjs;
      if (!value || !start || value.isAfter(start)) return Promise.resolve();
      return Promise.reject(new Error("End must be after start"));
    },
  }),
];

export default function AdminPage() {
  const [form] = Form.useForm<AdminFormValues>();
  const [saving, setSaving] = useState<boolean>(false);
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<SlotsApiResponse>("/slots");
      setSlots(data.slots);
    } catch (err: unknown) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  // Fill the form with the sample slots from the spec
  function loadSample() {
    form.setFieldsValue({
      slots: SAMPLE_SLOTS.map((s) => ({
        id: s.id,
        provider: s.provider,
        start: dayjs(s.start as string),
        end: dayjs(s.end as string),
      })),
    });
  }

  // Ask first, because reset deletes all bookings
  function askToReset(values: AdminFormValues) {
    if (!values.slots?.length) {
      toast.error("Add at least one slot.");
      return;
    }

    // Change the form values into the shape the backend expects
    const payload = {
      slots: values.slots.map((s) => ({
        id: s.id.trim(),
        provider: s.provider.trim(),
        start: s.start.toISOString(),
        end: s.end.toISOString(),
      })),
    };

    Modal.confirm({
      title: "Replace all slots?",
      content:
        "This deletes every booking and all current slots. This cannot be undone.",
      okText: "Yes, replace",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => replaceSlots(payload),
    });
  }

  async function replaceSlots(payload: {
    slots: { id: string; provider: string; start: string; end: string }[];
  }) {
    setSaving(true);
    try {
      const data = await api<ResetApiResponse>("/reset", {
        method: "POST",
        body: payload,
      });
      toast.success(`Done. ${data.slots_created} slots saved.`);
      form.resetFields();
      loadSlots();
    } catch (err: unknown) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const columns: ColumnsType<SlotItem> = [
    { title: "ID", dataIndex: "id", key: "id" },
    { title: "Doctor", dataIndex: "provider", key: "provider" },
    { title: "Start", key: "start", render: (_, s) => fmt(s.start as string) },
    {
      title: "End",
      key: "end",
      render: (_, s) => dayjs(s.end as string).format("HH:mm"),
    },
    {
      title: "Status",
      key: "status",
      render: (_, s) => (
        <Tag color={s.available ? "green" : "default"}>
          {s.available ? "Free" : "Booked"}
        </Tag>
      ),
    },
  ];

  return (
    <>
      <Typography.Title level={4}>Admin dashboard</Typography.Title>

      <Alert
        type='warning'
        showIcon
        className={styles.alertBox}
        title='Replacing slots deletes all bookings. Use it carefully.'
      />

      <Card
        title='Set the slots'
        className={styles.setSlotsCard}
        extra={
          <Button icon={<ThunderboltOutlined />} onClick={loadSample}>
            Load sample
          </Button>
        }>
        <Form<AdminFormValues>
          form={form}
          layout='vertical'
          onFinish={askToReset}
          initialValues={{ slots: [] }}>
          <Form.List name='slots'>
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }, index) => (
                  <Card
                    key={key}
                    size='small'
                    title={`Slot ${index + 1}`}
                    className={styles.subCard}
                    extra={
                      <Button
                        danger
                        type='text'
                        icon={<DeleteOutlined />}
                        onClick={() => remove(name)}
                        aria-label='Remove slot'
                      />
                    }>
                    <Row gutter={12}>
                      <Col xs={24} md={6}>
                        <Form.Item
                          {...restField}
                          name={[name, "id"]}
                          label='Slot ID'
                          rules={idRules}>
                          <Input placeholder='s4' />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item
                          {...restField}
                          name={[name, "provider"]}
                          label='Doctor'
                          rules={[
                            {
                              required: true,
                              message: "Enter the doctor's name",
                            },
                            {
                              whitespace: true,
                              message: "Name cannot be only spaces",
                            },
                          ]}>
                          <Input placeholder='Dr Ade' />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item
                          {...restField}
                          name={[name, "start"]}
                          label='Start'
                          rules={[
                            { required: true, message: "Pick a start time" },
                          ]}>
                          <DatePicker
                            showTime
                            format='YYYY-MM-DD HH:mm'
                            className={styles.datePickerFull}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item
                          {...restField}
                          name={[name, "end"]}
                          label='End'
                          dependencies={[["slots", name, "start"]]}
                          rules={endRules(name)}>
                          <DatePicker
                            showTime
                            format='YYYY-MM-DD HH:mm'
                            className={styles.datePickerFull}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                ))}

                <Button
                  type='dashed'
                  block
                  icon={<PlusOutlined />}
                  onClick={() => add()}>
                  Add slot
                </Button>
              </>
            )}
          </Form.List>

          <Form.Item className={styles.submitButtonMargin}>
            <Button
              type='primary'
              danger
              htmlType='submit'
              loading={saving}
              block>
              Replace all slots
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card
        title='Current slots'
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={loadSlots}
            loading={loading}>
            Refresh
          </Button>
        }>
        <Table<SlotItem>
          rowKey='id'
          size='small'
          columns={columns}
          dataSource={slots}
          loading={loading}
          scroll={{ x: 600 }}
          pagination={{ pageSize: 8 }}
        />
      </Card>
    </>
  );
}
