import { useState } from "react";
import { Button, Card, Form, Input, Select, Typography } from "antd";
import {
  LockOutlined,
  MailOutlined,
  MedicineBoxOutlined,
} from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import styles from "./SignUpPage.module.css";
import { supabase } from "../../../lib/supabase";

interface SignUpFormValues {
  email: string;
  password: string;
  role: "admin" | "patient";
}

export default function SignUpPage() {
  const [submitting, setSubmitting] = useState<boolean>(false);
  const navigate = useNavigate();

  async function handleSignUp(values: SignUpFormValues): Promise<void> {
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: values.email.trim().toLowerCase(),
      password: values.password,
      options: {
        data: {
          role: values.role,
        },
      },
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.auth.signOut();
    toast.success("Account created!", {
      duration: 6000,
    });
    navigate("/login");
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
            Create an account to get started
          </Typography.Text>
        </div>

        <Form<SignUpFormValues>
          layout='vertical'
          onFinish={handleSignUp}
          requiredMark={false}
          initialValues={{ role: "patient" }}>
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

          <Form.Item
            name='role'
            label='Role'
            rules={[{ required: true, message: "Please select a role" }]}>
            <Select
              size='large'
              placeholder='Select your role'
              options={[
                { value: "patient", label: "Patient" },
                { value: "admin", label: "Admin" },
              ]}
            />
          </Form.Item>

          <Button
            type='primary'
            htmlType='submit'
            size='large'
            block
            loading={submitting}>
            Sign up
          </Button>
        </Form>

        <div className={styles.footer}>
          <Typography.Text type='secondary'>
            Already have an account? <Link to='/login'>Sign in</Link>
          </Typography.Text>
        </div>
      </Card>
    </div>
  );
}
