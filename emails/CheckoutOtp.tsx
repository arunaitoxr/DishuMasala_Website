import { Text } from "@react-email/components";
import { EmailLayout, emailStyles } from "./components/Layout";

export default function CheckoutOtpEmail({ code }: { code: string }) {
  return (
    <EmailLayout previewText={`Your Dishu Masala verification code is ${code}`}>
      <Text style={emailStyles.h1}>Your verification code</Text>
      <Text style={emailStyles.body}>Enter this code at checkout to confirm your email address and place your order.</Text>
      <Text style={{ ...emailStyles.h1, letterSpacing: "0.3em", fontSize: "32px" }}>{code}</Text>
      <Text style={emailStyles.itemMeta}>It expires in 10 minutes. If you didn&apos;t try to place an order, you can ignore this email.</Text>
    </EmailLayout>
  );
}
