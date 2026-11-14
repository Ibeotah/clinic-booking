import { Tabs, Typography } from "antd";
import SlotsPanel from "./patient/SlotsPanel";
import MyBookingsPanel from "./patient/MyBookingsPanel/MyBookingsPanel";

export default function PatientPage() {
  return (
    <>
      <Typography.Title level={4}>Patient dashboard</Typography.Title>
      <Tabs
        defaultActiveKey="book"
        items={[
          { key: "book", label: "Book a slot", children: <SlotsPanel /> },
          { key: "mine", label: "My bookings", children: <MyBookingsPanel /> },
        ]}
      />
    </>
  );
}