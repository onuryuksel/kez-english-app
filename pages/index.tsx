import dynamic from "next/dynamic";

const RealtimeClient = dynamic(() => import("../components/RealtimeClient"), { ssr: false });

export default function Home() {
  return (
    <RealtimeClient />
  );
}