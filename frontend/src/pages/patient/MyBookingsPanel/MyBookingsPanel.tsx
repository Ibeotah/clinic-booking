// This component does:

// Lists the patient's bookings with GET /bookings?email=...&limit=10.
// Loads more pages with next_cursor.
// Views one booking with GET /bookings/{id}.
// Cancels with DELETE /bookings/{id}.


import { useCallback, useEffect, useState } from "react";
import { Button, Descriptions, Modal, Popconfirm, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import toast from "react-hot-toast";
import styles from "./MyBookingsPanel.module.css";
import { useAuth } from "../../../context/AuthContext";
import { api, errorMessage } from "../../../lib/api";
import { fmt } from "../../../lib/format";

const PAGE_SIZE = 10;

const statusColor: Record<string, string> = { confirmed: "green", cancelled: "red" };

interface Booking {
  id: string;
  slot_id: string;
  name: string;
  email: string;
  status: "confirmed" | "cancelled";
  created_at: string;
}

interface BookingsResponse {
  bookings: Booking[];
  next_cursor: string | null;
}

export default function MyBookingsPanel() {
  const { user } = useAuth();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [detail, setDetail] = useState<Booking | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Ask the backend for one page of this patient's bookings
  const fetchPage = useCallback(
    async (cursor: string | null): Promise<BookingsResponse> => {
      if (!user?.email) throw new Error("User email is missing");
      const params = new URLSearchParams({ email: user.email, limit: String(PAGE_SIZE) });
      if (cursor) params.set("cursor", cursor);
      return api<BookingsResponse>(`/bookings?${params}`);
    },
    [user?.email]
  );

  // First page (replaces the list)
  const loadFirst = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const data = await fetchPage(null);
      setBookings(data.bookings);
      setNextCursor(data.next_cursor);
    } catch (err: unknown) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [fetchPage, user?.email]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  // Next page (adds to the list)
  async function loadMore(): Promise<void> {
    setLoading(true);
    try {
      const data = await fetchPage(nextCursor);
      setBookings((prev) => [...prev, ...data.bookings]);
      setNextCursor(data.next_cursor);
    } catch (err: unknown) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function viewBooking(id: string): Promise<void> {
    try {
      const data = await api<Booking>(`/bookings/${id}`);
      setDetail(data);
    } catch (err: unknown) {
      toast.error(errorMessage(err));
    }
  }

  async function cancelBooking(id: string): Promise<void> {
    setBusyId(id);
    try {
      await api(`/bookings/${id}`, { method: "DELETE" });
      toast.success("Booking cancelled. The slot is free again.");
      loadFirst();
    } catch (err: unknown) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const columns: ColumnsType<Booking> = [
    { title: "Slot", dataIndex: "slot_id", key: "slot_id" },
    { title: "Name", dataIndex: "name", key: "name" },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => <Tag color={statusColor[status]}>{status}</Tag>,
    },
    { title: "Booked on", dataIndex: "created_at", key: "created_at", render: (v: string) => fmt(v) },
    {
      title: "Actions",
      key: "actions",
      render: (_, b) => (
        <Space wrap>
          <Button size="small" onClick={() => viewBooking(b.id)}>
            View
          </Button>
          {b.status === "confirmed" && (
            <Popconfirm
              title="Cancel this booking?"
              description="The slot will become free for others."
              okText="Yes, cancel"
              cancelText="No"
              onConfirm={() => cancelBooking(b.id)}
            >
              <Button size="small" danger loading={busyId === b.id}>
                Cancel
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Table<Booking>
        rowKey="id"
        columns={columns}
        dataSource={bookings}
        loading={loading}
        scroll={{ x: 650 }}
        pagination={false}
      />

      {nextCursor && (
        <div className={styles.loadMoreContainer}>
          <Button onClick={loadMore} loading={loading}>
            Load more
          </Button>
        </div>
      )}

      <Modal
        open={!!detail}
        title="Booking details"
        onCancel={() => setDetail(null)}
        footer={<Button onClick={() => setDetail(null)}>Close</Button>}
      >
        {detail && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Booking ID">{detail.id}</Descriptions.Item>
            <Descriptions.Item label="Slot">{detail.slot_id}</Descriptions.Item>
            <Descriptions.Item label="Name">{detail.name}</Descriptions.Item>
            <Descriptions.Item label="Email">{detail.email}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={statusColor[detail.status]}>{detail.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Booked on">{fmt(detail.created_at)}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  );
}