"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

export function FavoritePractitionerButton({practitionerId,initial,memberSignedIn,compact=false}:{practitionerId:string;initial:boolean;memberSignedIn:boolean;compact?:boolean}){const[favorited,setFavorited]=useState(initial);const[loading,setLoading]=useState(false);async function toggle(){if(!memberSignedIn){window.location.assign("/account?mode=register");return;}setLoading(true);const response=await fetch("/api/member/favorites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({practitionerId})});const data=await response.json();if(response.ok)setFavorited(data.favorited);setLoading(false);}return <button type="button" className={`favorite-button ${favorited?"active":""} ${compact?"compact":""}`} onClick={toggle} disabled={loading} aria-label={favorited?"Remove from saved astrologers":"Save astrologer"}><Heart size={compact?16:18} fill={favorited?"currentColor":"none"}/>{!compact&&<span>{favorited?"Saved":"Save guide"}</span>}</button>;}
