import { Link } from "@/i18n/navigation";
import { ArrowLeft,ShieldAlert } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";

export default function UnauthorizedPage(){return <AdminShell active="Overview"><div className="admin-content"><section className="permission-denied"><span><ShieldAlert size={28}/></span><p>Permission boundary</p><h1>This workspace is outside<br/><em>your assigned role.</em></h1><p>Ask a workspace owner if your responsibilities require additional access.</p><Link className="button" href="/admin"><ArrowLeft size={15}/>Return to overview</Link></section></div></AdminShell>;}
