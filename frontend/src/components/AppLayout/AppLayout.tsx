import { Outlet, useNavigate } from "react-router-dom";
import { Button, Layout, Space, Tag, Typography } from "antd";
import { LogoutOutlined, MedicineBoxOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import styles from "./AppLayout.module.css";
import { useAuth } from "../../context/AuthContext";

export default function AppLayout() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

  async function logout(): Promise<void> {
    await signOut();
    toast.success("You are logged out.");
    navigate("/login", { replace: true });
  }

  return (
    <Layout className={styles.layout}>
      <Layout.Header className={styles.header}>
        <Space>
          <MedicineBoxOutlined className={styles.brandIcon} />
          <Typography.Text strong>Koya Clinic</Typography.Text>
          <Tag color={role === "admin" ? "purple" : "cyan"}>{role}</Tag>
        </Space>

        <Space wrap>
          <Typography.Text type="secondary" className={styles.hideMobile}>
            {user?.email}
          </Typography.Text>
          <Button icon={<LogoutOutlined />} onClick={logout}>
            Logout
          </Button>
        </Space>
      </Layout.Header>

      <Layout.Content className={styles.content}>
        <div className={styles.container}>
          <Outlet />
        </div>
      </Layout.Content>
    </Layout>
  );
}