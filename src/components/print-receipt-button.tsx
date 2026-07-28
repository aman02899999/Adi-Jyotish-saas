"use client";

import { Printer } from "lucide-react";

export function PrintReceiptButton(){return <button className="button button--small print-receipt-button" onClick={()=>window.print()}><Printer size={14}/>Print receipt</button>;}
