
// The aim of this component (SlotsPanel) is to serve as the patient booking dashboard interface. It allows patients to:

// View available doctor schedules/slots in real-time.

// Filter slots by a specific doctor.

// Open a secure modal to confirm and submit a booking with idempotency protection and rate-limiting safeguards.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { CalendarOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import { api, errorMessage } from "../../lib/api";
import styles from "./SlotsPanel.module.css";
import { useAuth } from "../../context/AuthContext";
import { fmt } from "../../lib/format";

interface Slot {
  id: string;
  provider: string;
  start: string;
  end: string;
  available: boolean;
}

interface SlotsResponse {
  slots: Slot[];
}

interface BookingFormValues {
  name: string;
}

export default function SlotsPanel() {
  const { user } = useAuth();
  const [form] = Form.useForm<BookingFormValues>();

  const [slots, setSlots] = useState<Slot[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [selected, setSelected] = useState<Slot | null>(null);   // slot being booked
  const [submitting, setSubmitting] = useState<boolean>(false);
  const idemKey = useRef<string | null>(null);                   // one key per booking attempt

  // 1. Load slots (optionally for one doctor)
  const loadSlots = useCallback(async (provider?: string) => {
    setLoading(true);
    try {
      const query = provider ? `?provider=${encodeURIComponent(provider)}` : "";
      const data = await api<SlotsResponse>(`/slots${query}`);
      setSlots(data.slots);
      // Build the doctor list only from the full list
      if (!provider) {
        setProviders([...new Set(data.slots.map((s) => s.provider))].sort());
      }
    } catch (err: unknown) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSlots(filter);
  }, [filter, loadSlots]);

  // 2. Clear the form each time the modal opens
  useEffect(() => {
    if (selected) form.resetFields();
  }, [selected, form]);

  function openBooking(slot: Slot) {
    // New request = new key. A new slot must never reuse an old key.
    idemKey.current = crypto.randomUUID();
    setSelected(slot);
  }

  function closeBooking() {
    setSelected(null);
  }

  // 3. Send the booking
  async function handleBook(values: BookingFormValues): Promise<void> {
    if (!selected || !user?.email) return;

    setSubmitting(true);
    try {
      await api("/bookings", {
        method: "POST",
        idempotencyKey: idemKey.current ?? undefined,
        body: {
          slot_id: selected.id,
          name: values.name.trim(),
          email: user.email,
        },
      });
      toast.success(`Booked ${selected.provider} on ${fmt(selected.start)}`);
      idemKey.current = null;
      closeBooking();
      loadSlots(filter);
    } catch (err: any) {
      if (err.status === 0) {
        // No connection: keep the same key, so pressing Confirm again is safe
        toast.error(`${errorMessage(err)} Press Confirm again to retry.`);
      } else {
        // Any other answer: the attempt is over, so start fresh next time
        toast.error(errorMessage(err));
        idemKey.current = null;
        closeBooking();
        loadSlots(filter);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const columns: ColumnsType<Slot> = [
    { title: "Doctor", dataIndex: "provider", key: "provider" },
    { title: "Start", key: "start", render: (_, s) => fmt(s.start) },
    { title: "End", key: "end", render: (_, s) => dayjs(s.end).format("HH:mm") },
    {
      title: "Status",
      key: "status",
      render: (_, s) => (
        <Tag color={s.available ? "green" : "default"}>{s.available ? "Free" : "Booked"}</Tag>
      ),
    },
    {
      title: "",
      key: "action",
      render: (_, s) => {
        const started = dayjs(s.start).isBefore(dayjs());
        const disabled = !s.available || started;
        const label = started ? "Started" : s.available ? "Book" : "Taken";
        return (
          <Button type="primary" size="small" disabled={disabled} onClick={() => openBooking(s)}>
            {label}
          </Button>
        );
      },
    },
  ];

  return (
    <>
      <Space wrap className={styles.spaceFilter}>
        <Select
          allowClear
          showSearch
          placeholder="Filter by doctor"
          className={styles.selectDoctor}
          value={filter}
          onChange={(val: string | undefined) => setFilter(val)}
          options={providers.map((p) => ({ value: p, label: p }))}
        />
      </Space>

      <Table<Slot>
        rowKey="id"
        columns={columns}
        dataSource={slots}
        loading={loading}
        scroll={{ x: 600 }}
        pagination={{ pageSize: 8 }}
      />

      <Modal
        open={!!selected}
        title="Confirm your booking"
        onCancel={closeBooking}
        footer={null}
        destroyOnClose
      >
        {selected && (
          <Typography.Paragraph className={styles.modalParagraph}>
            <CalendarOutlined /> {selected.provider} · {fmt(selected.start)} –{" "}
            {dayjs(selected.end).format("HH:mm")}
          </Typography.Paragraph>
        )}

        <Form form={form} layout="vertical" onFinish={handleBook}>
          <Form.Item<BookingFormValues>
            label="Full name"
            name="name"
            rules={[
              { required: true, message: "Please enter your name" },
              { whitespace: true, message: "Name cannot be only spaces" },
              { min: 2, message: "Name must be at least 2 letters" },
            ]}
          >
            <Input placeholder="e.g. Ada Obi" maxLength={80} />
          </Form.Item>

          <Form.Item label="Email">
            <Input value={user?.email} disabled />
          </Form.Item>

          <Space className={styles.modalFooterSpace} wrap>
            <Button onClick={closeBooking}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Confirm booking
            </Button>
          </Space>
        </Form>
      </Modal>
    </>
  );
}