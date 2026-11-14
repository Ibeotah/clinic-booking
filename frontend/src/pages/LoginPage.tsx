import { useState } from "react";
import { Button, Card, Form, Input, Typography } from "antd";
import {
  LockOutlined,
  MailOutlined,
  MedicineBoxOutlined,
} from "@ant-design/icons";
import { Navigate } from "react-router-dom";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { getRole, homePath, useAuth } from "../context/AuthContext";
import styles from "./LoginPage.module.css";

const KNOWN_ROLES = ["admin", "patient"];

interface LoginFormValues {
  email: string;
  password: string;
}

export default function LoginPage() {
  const { user, role, loading } = useAuth();
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Already logged in with a valid role: skip the form
  if (!loading && user && KNOWN_ROLES.includes(role)) {
    return <Navigate to={homePath(role)} replace />;
  }

  async function handleLogin(values: LoginFormValues): Promise<void> {
    setSubmitting(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: values.email.trim().toLowerCase(),
      password: values.password,
    });
    setSubmitting(false);

    if (error) {
      toast.error(
        error.message === "Invalid login credentials"
          ? "Wrong email or password."
          : error.message,
      );
      return;
    }

    // Account exists but has no valid role
    if (!KNOWN_ROLES.includes(getRole(data.user))) {
      await supabase.auth.signOut();
      toast.error("This account has no valid role. Ask the admin to fix it.");
      return;
    }

    toast.success("Welcome back!");
    // The Navigate above sends the user to their page when the session updates.
  }

  return (
    <div className={styles.wrapper}>
      <Card className={styles.card}>
        <div className={styles.header}>
          <MedicineBoxOutlined className={styles.logoIcon} />
          <Typography.Title level={3} className={styles.title}>
            Koya Clinic
          </Typography.Title>
          <Typography.Text type='secondary'>
            Sign in to book or manage appointments
          </Typography.Text>
        </div>

        <Form<LoginFormValues>
          layout='vertical'
          onFinish={handleLogin}
          requiredMark={false}>
          <Form.Item
            name='email'
            label='Email'
            rules={[
              { required: true, message: "Please enter your email" },
              {
                type: "email",
                message: "Enter a valid email, like name@clinic.com",
              },
            ]}>
            <Input
              prefix={<MailOutlined />}
              placeholder='name@clinic.com'
              size='large'
            />
          </Form.Item>

          <Form.Item
            name='password'
            label='Password'
            rules={[
              { required: true, message: "Please enter your password" },
              { min: 6, message: "Password must be at least 6 characters" },
            ]}>
            <Input.Password
              prefix={<LockOutlined />}
              placeholder='Your password'
              size='large'
            />
          </Form.Item>

          <Button
            type='primary'
            htmlType='submit'
            size='large'
            block
            loading={submitting}>
            Sign in
          </Button>
        </Form>
      </Card>
    </div>
  );
}
