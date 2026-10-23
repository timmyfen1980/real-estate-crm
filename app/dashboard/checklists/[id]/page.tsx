'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CHECKLISTS,
  CHECKLIST_TYPE_LABELS,
  REQUIRED_BADGE,
  ChecklistType,
} from '@/lib/checklists';
import {
  ClientFile,
  ClientDocument,
  enablePortalAccess,
  portalLink,
} from '@/lib/checklistDb';

export default function ClientFileDetailPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.id as string;

  const [file, setFile] = useState<ClientFile | null>(null);
  const [docs, setDocs] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ChecklistType | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingDeal, setEditingDeal] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
  // Deal form fields
  const [fAddress, setFAddress] = useState('');
  const [fLawyerName, setFLawyerName] = useState('');
  const [fLawyerFirm, setFLawyerFirm] = useState('');
  const [fLawyerContact, setFLawyerContact] = useState('');
  const [fCoop, setFCoop] = useState('');
  const [fOfferDate, setFOfferDate] = useState('');
  const [fClosingDate, setFClosingDate] = useState('');
  const [fPrice, setFPrice] = useState('');
  const [fDeposit, setFDeposit] = useState('');
  const [fConditions, setFConditions] = useState('');
  const [fNotes, setFNotes] = useState('');
  // Deal picker
  const [contactDeals, setContactDeals] = useState<any[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [showDealPicker, setShowDealPicker] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fintracFix, setFintracFix] = useState<null | {
    firstName: string;
    lastName: string;
    occupation: string;
    licenceNumber: string;
    needName: boolean;
    needOccupation: boolean;
    needLicence: boolean;
    licenceNote: boolean;
  }>(null);
  const [fintracFixBusy, setFintracFixBusy] = useState(false);
  // The mirrored contact (Tim, 2026-10-23): this page is where a
  // contact gets ready to be a client, so the contact's own facts
  // live here too — same record, editable from either place.
  const [repPrep, setRepPrep] = useState<null | {
    kind: '371' | '372';
    designatedRep: string;
    termStart: string;
    termEnd: string;
    commPct: string;
    commLease: string;
    holdover: string;
    geo: string;
    propType: string;
  }>(null);
  const [repBusy, setRepBusy] = useState(false);
  const [lstPrep, setLstPrep] = useState<null | {
    kind: '271' | '272';
    designatedRep: string;
    termStart: string;
    termEnd: string;
    price: string;
    totalPct: string;
    coopPct: string;
    totalText: string;
    coopText: string;
    holdover: string;
  }>(null);
  const [lstBusy, setLstBusy] = useState(false);
  const [contact, setContact] = useState<any>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [cForm, setCForm] = useState<Record<string, string>>({});
  const [filePackages, setFilePackages] = useState<any[]>([]);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [dragOverDocId, setDragOverDocId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [fileId]);

  const loadData = async () => {
    const { data: fileData } = await supabase
      .from('client_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (!fileData) {
      setLoading(false);
      return;
    }
    setFile(fileData as ClientFile);
    setActiveTab((fileData as ClientFile).checklist_types[0] || null);
    if ((fileData as ClientFile).crm_contact_id) {
      const { data: cData } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', (fileData as ClientFile).crm_contact_id)
        .single();
      if (cData) {
        setContact(cData);
        setCForm({
          first_name: cData.first_name || '',
          last_name: cData.last_name || '',
          phone: cData.phone || '',
          email: cData.email || '',
          address: cData.address || '',
          city: cData.city || '',
          province: cData.province || '',
          postal_code: cData.postal_code || '',
          birthday: (cData.birthday || cData.date_of_birth || '').slice(0, 10),
          licence_number: cData.licence_number || '',
          licence_province: cData.licence_province || '',
          licence_expiry: (cData.licence_expiry || '').slice(0, 10),
          occupation: cData.occupation || '',
        });
      }
    }
    // Populate deal form
    const f = fileData as ClientFile;
    setFAddress(f.property_address || '');
    setFLawyerName(f.lawyer_name || '');
    setFLawyerFirm(f.lawyer_firm || '');
    setFLawyerContact(f.lawyer_contact || '');
    setFCoop(f.coop_info || '');
    setFOfferDate(f.deal_dates?.offer_date || '');
    setFClosingDate(f.deal_dates?.closing_date || '');
    setFPrice(f.financials?.price || '');
    setFDeposit(f.financials?.deposit || '');
    setFConditions(f.conditions || '');
    setFNotes(f.notes || '');

    const { data: docData } = await supabase
      .from('client_documents')
      .select('*')
      .eq('client_file_id', fileId)
      .order('stage_index')
      .order('doc_index');

    const loadedDocs = (docData || []) as ClientDocument[];

    // Documents uploaded by clients through the website portal store the
    // raw storage path in file_url instead of a URL (team uploads store a
    // signed URL). Resolve path-based entries to signed URLs here, at load
    // time, so View file / Download / Download-all work for them too.
    const resolvedDocs = await Promise.all(
      loadedDocs.map(async (d) => {
        if (!d.file_url || d.file_url.startsWith('http')) return d;
        try {
          const res = await fetch(
            `/api/client-doc-url?path=${encodeURIComponent(d.file_url)}`
          );
          if (!res.ok) return d;
          const body = (await res.json()) as { url?: string };
          return body.url ? { ...d, file_url: body.url } : d;
        } catch {
          return d;
        }
      })
    );

    setDocs(resolvedDocs);
    // Deals for this contact drive the Receipt of Funds timing (it's
    // due once there's an accepted offer) and the deal picker.
    if ((fileData as ClientFile).crm_contact_id) {
      const { data: dealRows } = await supabase
        .from('deals')
        .select('id, deal_type, status, property_id')
        .eq('contact_id', (fileData as ClientFile).crm_contact_id)
        .eq('account_id', (fileData as ClientFile).account_id)
        .order('created_at', { ascending: false });
      if (dealRows) setContactDeals(dealRows);
      // Offer packages already linked to this client file — the
      // readiness chips open the existing card instead of duplicating.
      try {
        const res = await fetch('/api/offers/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'find_for_client_file', client_file_id: fileId }),
        });
        const data = await res.json();
        if (data.ok && Array.isArray(data.packages)) setFilePackages(data.packages);
      } catch {
        /* package lookup is an extra — never block the file */
      }
    }
    setLoading(false);
  };

  const setStatus = async (docId: string, status: ClientDocument['status']) => {
    const { error } = await supabase
      .from('client_documents')
      .update({
        status,
        received_at: status === 'received' ? new Date().toISOString() : null,
        received_via: status === 'received' ? 'manual' : null,
      })
      .eq('id', docId);

    if (!error) {
      setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, status } : d)));
    }
  };

  const handleEnablePortal = async () => {
    if (!file) return;
    setPortalBusy(true);
    try {
      const token = await enablePortalAccess(file.id);
      setFile({ ...file, portal_token: token, portal_enabled: true });
    } catch (err: any) {
      console.error('ENABLE PORTAL ERROR:', err);
      alert(err?.message || 'Failed to enable portal — please try again');
    } finally {
      setPortalBusy(false);
    }
  };

  const copyPortalLink = async () => {
    if (!file?.portal_token) return;
    await navigator.clipboard.writeText(portalLink(file.portal_token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openRepPrep = () => {
    if (!repKindHere) return;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    const end = (() => {
      const [y, m, d] = today.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1 + 6, d));
      const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(dt.getUTCDate()).padStart(2, '0');
      return `${dt.getUTCFullYear()}-${mm}-${dd}`;
    })();
    setRepPrep({
      kind: repKindHere,
      designatedRep: 'Tim Fennessey, Salesperson',
      termStart: today,
      termEnd: end,
      commPct: '2.5',
      commLease: '',
      holdover: '90',
      geo: cForm.city || '',
      propType: 'Residential',
    });
  };

  const submitRepPrep = async () => {
    if (!repPrep || !file?.crm_contact_id) return;
    setRepBusy(true);
    try {
      const res = await fetch('/api/client-files/generate-rep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: file.crm_contact_id,
          client_file_id: file.id,
          kind: repPrep.kind,
          answers: {
            designated_reps: [repPrep.designatedRep],
            term_start: repPrep.termStart,
            term_end: repPrep.termEnd,
            commission_purchase_pct: repPrep.commPct,
            commission_lease: repPrep.commLease || undefined,
            holdover_days: repPrep.holdover,
            geographic_location: repPrep.geo || undefined,
            property_type_use: repPrep.propType || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const miss = Array.isArray(data.missing) && data.missing.length
          ? ' Still needed: ' + data.missing.join('; ')
          : '';
        throw new Error((data.error || 'Preparation failed') + miss);
      }
      setRepPrep(null);
      alert(
        `Form ${repPrep.kind} prepared and saved to this client file — it's on the checklist row, ready to send for signature.`
      );
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to prepare the agreement.');
    } finally {
      setRepBusy(false);
    }
  };

  const openLstPrep = () => {
    if (!listingKindHere) return;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    const end = (() => {
      const [y, m, d] = today.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1 + 6, d));
      const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(dt.getUTCDate()).padStart(2, '0');
      return `${dt.getUTCFullYear()}-${mm}-${dd}`;
    })();
    setLstPrep({
      kind: listingKindHere,
      designatedRep: 'Tim Fennessey, Salesperson',
      termStart: today,
      termEnd: end,
      price: (fPrice || '').replace(/[$,]/g, ''),
      totalPct: '5',
      coopPct: '2.5',
      totalText: listingKindHere === '272' ? "One month's rent plus HST" : '',
      coopText: listingKindHere === '272' ? "50% of one month's rent plus HST" : '',
      holdover: '90',
    });
  };

  const submitLstPrep = async () => {
    if (!lstPrep || !file?.crm_contact_id) return;
    setLstBusy(true);
    try {
      const res = await fetch('/api/client-files/generate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: file.crm_contact_id,
          client_file_id: file.id,
          kind: lstPrep.kind,
          answers: {
            designated_reps: [lstPrep.designatedRep],
            term_start: lstPrep.termStart,
            term_end: lstPrep.termEnd,
            price: lstPrep.price || undefined,
            commission_total_pct: lstPrep.kind === '271' ? lstPrep.totalPct : undefined,
            commission_coop_pct: lstPrep.kind === '271' ? lstPrep.coopPct : undefined,
            commission_total: lstPrep.kind === '272' ? lstPrep.totalText : undefined,
            commission_coop: lstPrep.kind === '272' ? lstPrep.coopText : undefined,
            holdover_days: lstPrep.holdover,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const miss = Array.isArray(data.missing) && data.missing.length
          ? ' Still needed: ' + data.missing.join('; ')
          : '';
        throw new Error((data.error || 'Preparation failed') + miss);
      }
      setLstPrep(null);
      alert(
        `Form ${lstPrep.kind} prepared and saved to this client file — it's on the checklist row, ready to send for signature.`
      );
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to prepare the listing agreement.');
    } finally {
      setLstBusy(false);
    }
  };

  // Save the mirrored contact facts — writes to the SAME contacts
  // record the contact page edits, so both places always agree.
  const handleSaveContact = async () => {
    if (!file?.crm_contact_id) return;
    setSavingContact(true);
    const clean = (v: string) => {
      const t = (v || '').trim();
      return t === '' ? null : t;
    };
    const { data, error } = await supabase
      .from('contacts')
      .update({
        first_name: clean(cForm.first_name),
        last_name: clean(cForm.last_name),
        phone: clean(cForm.phone),
        email: clean(cForm.email),
        address: clean(cForm.address),
        city: clean(cForm.city),
        province: clean(cForm.province),
        postal_code: clean(cForm.postal_code),
        birthday: clean(cForm.birthday),
        licence_number: clean(cForm.licence_number),
        licence_province: clean(cForm.licence_province),
        licence_expiry: clean(cForm.licence_expiry),
        occupation: clean(cForm.occupation),
      })
      .eq('id', file.crm_contact_id)
      .select()
      .single();
    setSavingContact(false);
    if (error) {
      alert('Could not save the contact details: ' + error.message);
      return;
    }
    if (data) setContact(data);
    setEditingContact(false);
  };

  const copyIdRequest = async () => {
    if (!file?.portal_token) return;
    const link = portalLink(file.portal_token);
    const msg = `Hi! Could you please upload a photo of your driver's licence here: ${link} — click on "Government photo ID" and upload a clear photo. Thanks!`;
    await navigator.clipboard.writeText(msg);
    alert('ID request message copied — paste it into a text or email.');
  };

  const scrollToDocs = () => {
    document.getElementById('client-docs')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Receipt of Funds Record (FINTRAC 635): due for a buyer once
  // there's an accepted offer — the amount defaults to the deposit
  // on the deal/file, using whatever we already have (Tim, 2026-10-23).
  const handleGenerate635 = async () => {
    if (!file?.crm_contact_id) return;
    if (!contact?.first_name && !contact?.last_name && !file.client_names) {
      alert('Add the client name first — it goes in Contact Details above.');
      return;
    }
    const depositDefault = (fDeposit || '').replace(/[$,]/g, '').trim();
    const amount = prompt('Funds amount (e.g. 25000):', depositDefault);
    if (!amount) return;
    const method = prompt('Method (electronic, in_person, or mail):', 'electronic');
    if (!method) return;
    try {
      const res = await fetch('/api/generate-fintrac-635', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: file.crm_contact_id,
          client_file_id: file.id,
          funds_amount: amount,
          funds_method: method,
          funds_date: new Date().toISOString().split('T')[0],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      alert('Receipt of Funds Record (FINTRAC Form 635) generated and filed.');
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Failed to generate form.');
    }
  };

  // Start a new offer package linked to this client file (the
  // readiness chips open the existing one when there is one).
  const startPackage = async () => {
    if (!file) return;
    try {
      const names = String(file.client_names || '')
        .split(/\s+and\s+|,\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      const isSellerSide = file.checklist_types.includes('seller') || file.checklist_types.includes('landlord');
      const deal: any = {
        client: {
          name: file.client_names,
          client_file_id: file.id,
          contact_id: file.crm_contact_id || undefined,
        },
      };
      if (isSellerSide) deal.sellers = names;
      else deal.buyers = names;
      if (file.property_address) {
        deal.property = { address: file.property_address };
        deal.listing = { clients: names, property_address: file.property_address };
      }
      const res = await fetch('/api/offers/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', deal, address: file.property_address || file.client_names }),
      });
      const data = await res.json();
      if (!data.ok || !data.id) throw new Error(data.error || 'Could not start the package');
      const hash = listingKindHere ? 'listing' : repKindHere ? 'rep' : 'offer';
      router.push(`/dashboard/offers/${data.id}#${hash}`);
    } catch (err: any) {
      alert(err.message || 'Could not start the offer package.');
    }
  };

  const repChipAction = () => {
    if (repReceived) return scrollToDocs();
    const pkg = filePackages[0];
    if (pkg) {
      router.push(`/dashboard/offers/${pkg.id}#${listingKindHere ? 'listing' : 'rep'}`);
      return;
    }
    if (repDocs[0]?.file_url) {
      void startPackage();
      return;
    }
    if (listingKindHere) openLstPrep();
    else if (repKindHere) openRepPrep();
    else scrollToDocs();
  };

  const handleSaveDeal = async () => {
    if (!file) return;
    setSavingDeal(true);
    const { data, error } = await supabase
      .from('client_files')
      .update({
        property_address: fAddress.trim(),
        lawyer_name: fLawyerName.trim(),
        lawyer_firm: fLawyerFirm.trim(),
        lawyer_contact: fLawyerContact.trim(),
        coop_info: fCoop.trim(),
        deal_dates: { offer_date: fOfferDate, closing_date: fClosingDate },
        financials: { price: fPrice, deposit: fDeposit },
        conditions: fConditions.trim(),
        notes: fNotes.trim(),
      })
      .eq('id', file.id)
      .select()
      .single();

    setSavingDeal(false);
    if (!error && data) {
      setFile(data as ClientFile);
      setEditingDeal(false);
    }
  };

  const fetchDealsForPicker = async () => {
    if (!file?.crm_contact_id) return;
    setLoadingDeals(true);
    setShowDealPicker(true);
    try {
      // Get account_id from file
      const { data: deals } = await supabase
        .from('deals')
        .select('id, deal_type, status, property_id')
        .eq('contact_id', file.crm_contact_id)
        .eq('account_id', file.account_id)
        .order('created_at', { ascending: false });

      if (deals && deals.length > 0) {
        const propIds = [...new Set(deals.map((d: any) => d.property_id).filter(Boolean))];
        let propMap: Record<string, any> = {};
        if (propIds.length > 0) {
          const { data: props } = await supabase
            .from('properties')
            .select('id, address, city, province')
            .in('id', propIds);
          (props || []).forEach((p: any) => { propMap[p.id] = p; });
        }
        setContactDeals(deals.map((d: any) => ({ ...d, property: propMap[d.property_id] || null })));
      } else {
        setContactDeals([]);
      }
    } finally {
      setLoadingDeals(false);
    }
  };

  const handleDownloadAll = async () => {
    const docsWithFiles = docs.filter((d) => d.file_url);
    if (docsWithFiles.length === 0) {
      alert('No files uploaded yet.');
      return;
    }
    setDownloadingAll(true);
    try {
      // Download each file individually (browser will handle multiple downloads)
      // For a zip, we'd need a server endpoint - for now, open each in new tab
      for (const doc of docsWithFiles) {
        if (doc.file_url) {
          window.open(doc.file_url, '_blank');
          // Small delay to avoid browser blocking
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!file) return;
    setDeleting(true);
    try {
      // Delete associated documents first
      await supabase.from('client_documents').delete().eq('client_file_id', file.id);
      // Delete the file record
      const { error } = await supabase.from('client_files').delete().eq('id', file.id);
      if (error) throw error;
      // Redirect to list
      router.push('/dashboard/checklists');
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete. Please try again.');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleFileUpload = async (docId: string, file: File) => {
    if (!file) return;
    setUploadingDocId(docId);
    try {
      // Upload to Supabase storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${fileId}/${docId}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL (bucket is private, so we create a signed URL)
      const { data: urlData } = await supabase.storage
        .from('client-documents')
        .createSignedUrl(fileName, 31536000); // 1 year

      const fileUrl = urlData?.signedUrl || '';

      // Update the document record
      const { error: dbError } = await supabase
        .from('client_documents')
        .update({
          file_url: fileUrl,
          status: 'received',
          received_at: new Date().toISOString(),
          received_via: 'upload',
        })
        .eq('id', docId);

      if (dbError) throw dbError;

      // Update local state
      setDocs((prev) => prev.map((d) => 
        d.id === docId 
          ? { ...d, file_url: fileUrl, status: 'received' as const }
          : d
      ));


    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed. Please try again.');
    } finally {
      setUploadingDocId(null);
      setDragOverDocId(null);
    }
  };

  const linkDeal = async (deal: any) => {
    if (!file) return;
    // Auto-fill address from deal property
    let addr = '';
    if (deal.property?.address) {
      addr = [deal.property.address, deal.property.city, deal.property.province]
        .filter(Boolean).join(', ');
      setFAddress(addr);
    }
    // Link the deal AND save the address to the database
    const updates: any = { crm_deal_id: deal.id };
    if (addr) updates.property_address = addr;
    const { data, error } = await supabase
      .from('client_files')
      .update(updates)
      .eq('id', file.id)
      .select()
      .single();
    if (error) {
      console.error('LINK DEAL ERROR:', error);
      alert('Failed to link deal — please try again');
      // Revert the address preview and keep the picker open so Tim can retry.
      setFAddress(file.property_address || '');
      return;
    }
    if (data) {
      setFile(data as ClientFile);
    }
    setShowDealPicker(false);
  };

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="p-8">
        <p className="text-red-600">Client file not found.</p>
        <Link href="/dashboard/checklists" className="text-blue-600 hover:underline">
          ← Back to client files
        </Link>
      </div>
    );
  }

  const tabDocs = docs.filter((d) => d.checklist_type === activeTab);
  const stages = activeTab ? CHECKLISTS[activeTab].stages : [];
  const received = tabDocs.filter((d) => ['received', 'waived', 'na'].includes(d.status)).length;

  // FINTRAC state (Tim, 2026-10-23): a 630/635 counts as done only
  // when a generated form is actually filed in this file's
  // documents — the buttons used to be permanently green whether
  // or not anything existed.
  const fintracFiled = (num: string, docName: string) =>
    docs.some(
      (d) =>
        ((d.form || '').includes(num) || (d.document || '').includes(docName)) &&
        d.status === 'received' &&
        !!d.file_url
    );
  const has630 = fintracFiled('630', 'Individual Identification');
  const has635 = fintracFiled('635', 'Receipt of Funds');
  // Receipt of Funds timing (Tim, 2026-10-23): it belongs to a
  // purchase — a buyer file with an accepted offer (a deal on the
  // contact, or an offer date on this file).
  const offerAccepted = contactDeals.length > 0 || !!file.deal_dates?.offer_date;
  const isBuyerFile = file.checklist_types.includes('buyer');
  const fundsDue = isBuyerFile && offerAccepted && !has635;
  const idDocReceived = docs.some((d) => {
    const n = (d.document || '').toLowerCase();
    return (
      (n.includes('photo id') || n.includes('licence') || n.includes('license') || n.includes('passport')) &&
      d.status === 'received'
    );
  });

  // FINTRAC 630 inline fix-up (Tim, 2026-10-23): the form needs the
  // client's name, occupation and licence number, all stored on the
  // contact. Instead of a dead-end "missing occupation" alert, ask
  // for exactly what's missing right here, save it to the contact,
  // then generate — no hunting for where the field lives.
  const runGenerate630 = async () => {
    try {
      const res = await fetch('/api/generate-fintrac-630', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: file.crm_contact_id, client_file_id: file.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      alert('Individual Identification Record (FINTRAC Form 630) generated and filed.');
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Failed to generate form.');
    }
  };

  const handleGenerate630 = async () => {
    const { data: contact } = await supabase
      .from('contacts')
      .select('first_name, last_name, occupation, licence_number')
      .eq('id', file.crm_contact_id)
      .single();
    const needName = !contact?.first_name && !contact?.last_name;
    const needOccupation = !contact?.occupation;
    const needLicence = !contact?.licence_number;
    if (needLicence && !idDocReceived) {
      alert('Upload the driver\'s licence first — add it to the contact or upload the Government ID document below.');
      return;
    }
    if (needName || needOccupation || needLicence) {
      setFintracFix({
        firstName: contact?.first_name || '',
        lastName: contact?.last_name || '',
        occupation: contact?.occupation || '',
        licenceNumber: contact?.licence_number || '',
        needName,
        needOccupation,
        needLicence,
        licenceNote: needLicence && idDocReceived,
      });
      return;
    }
    if (!confirm('Generate FINTRAC Form 630 for the linked contact?')) return;
    await runGenerate630();
  };

  const handleSaveFintracFix = async () => {
    if (!fintracFix) return;
    const update: Record<string, string> = {};
    if (fintracFix.needName) {
      if (fintracFix.firstName.trim()) update.first_name = fintracFix.firstName.trim();
      if (fintracFix.lastName.trim()) update.last_name = fintracFix.lastName.trim();
    }
    if (fintracFix.needOccupation && fintracFix.occupation.trim()) {
      update.occupation = fintracFix.occupation.trim();
    }
    if (fintracFix.needLicence && fintracFix.licenceNumber.trim()) {
      update.licence_number = fintracFix.licenceNumber.trim();
    }
    if (Object.keys(update).length === 0) {
      alert('Fill in at least one of the fields, or Cancel.');
      return;
    }
    setFintracFixBusy(true);
    const { error } = await supabase.from('contacts').update(update).eq('id', file.crm_contact_id);
    setFintracFixBusy(false);
    if (error) {
      alert('Could not save to the contact: ' + error.message);
      return;
    }
    setFintracFix(null);
    await runGenerate630();
  };

  const repDocs = docs.filter((d) =>
    (d.document || '').toLowerCase().includes('representation agreement')
  );
  const repReceived = repDocs.some((d) => d.status === 'received');
  const repKindHere: '371' | '372' | null = (() => {
    const f = (repDocs[0]?.form || '') + ' ' + (repDocs[0]?.document || '');
    if (f.includes('371')) return '371';
    if (f.includes('372')) return '372';
    return null;
  })();
  const listingKindHere: '271' | '272' | null = (() => {
    const f = (repDocs[0]?.form || '') + ' ' + (repDocs[0]?.document || '');
    if (f.includes('271')) return '271';
    if (f.includes('272')) return '272';
    return null;
  })();
  // Clickable readiness chips (Tim, 2026-10-23): each chip DOES the
  // thing — fill the form, send the request, or open/start the offer
  // package the item belongs to.
  const readyChips: {
    label: string;
    done: boolean;
    todo: string;
    neutral?: boolean;
    onClick: () => void;
  }[] = [
    {
      label: 'Photo ID',
      done: idDocReceived,
      todo: 'needed — click to copy the ID request',
      onClick: () => (idDocReceived ? scrollToDocs() : void copyIdRequest()),
    },
    {
      label: 'ID Record (630)',
      done: has630,
      todo: 'not filed — click to fill it',
      onClick: () => (has630 ? scrollToDocs() : void handleGenerate630()),
    },
    ...(isBuyerFile || has635
      ? [
          {
            label: 'Receipt of Funds (635)',
            done: has635,
            todo: fundsDue
              ? 'due now — click to fill it'
              : 'after an accepted offer',
            neutral: !has635 && !fundsDue,
            onClick: () => (has635 ? scrollToDocs() : handleGenerate635()),
          },
        ]
      : []),
    ...(repDocs.length
      ? [
          {
            label: 'Representation agreement',
            done: repReceived,
            todo: repDocs[0]?.file_url
              ? 'prepared — click to open the offer package'
              : 'agent to send — click to prepare it',
            onClick: repChipAction,
          },
        ]
      : []),
    {
      label: 'Client portal',
      done: !!file.portal_enabled,
      todo: 'not enabled — click to enable',
      onClick: () => (file.portal_enabled ? void copyPortalLink() : void handleEnablePortal()),
    },
  ];
  const contactFields: { key: string; label: string; type?: string; fintrac?: boolean }[] = [
    { key: 'first_name', label: 'First name' },
    { key: 'last_name', label: 'Last name' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'address', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'province', label: 'Province' },
    { key: 'postal_code', label: 'Postal code' },
    { key: 'birthday', label: 'Date of birth', type: 'date', fintrac: true },
    { key: 'licence_number', label: "Driver's licence #", fintrac: true },
    { key: 'licence_province', label: 'Licence province' },
    { key: 'licence_expiry', label: 'Licence expiry', type: 'date' },
    { key: 'occupation', label: 'Occupation', fintrac: true },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link href="/dashboard/checklists" className="text-sm text-blue-600 hover:underline">
        ← Back to client files
      </Link>

      {/* Deal header */}
      <div className="mt-4 bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">{file.client_names}</h1>
            {file.property_address && (
              <p className="text-gray-500 mt-1">{file.property_address}</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {file.checklist_types.map((t) => (
                <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                  {CHECKLIST_TYPE_LABELS[t as ChecklistType]}
                </span>
              ))}
            </div>
          </div>
          <div className="text-right">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="mb-2 px-3 py-1.5 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg border border-red-200"
            >
              Delete file
            </button>
          </div>
        </div>
        {/* Readiness strip — the one-glance answer to "what's still
            needed before this contact is a ready client?" */}
        <div className="mt-5 border-t pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Client readiness
            <span className="ml-2 font-normal normal-case text-gray-400">— click a chip to act on it</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {readyChips.map((c) => (
              <button
                key={c.label}
                onClick={c.onClick}
                title="Click to act on this item"
                className={
                  c.done
                    ? 'text-xs px-2.5 py-1.5 rounded-full border bg-green-50 border-green-300 text-green-800 font-medium hover:bg-green-100 transition'
                    : c.neutral
                      ? 'text-xs px-2.5 py-1.5 rounded-full border bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100 transition'
                      : 'text-xs px-2.5 py-1.5 rounded-full border bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 transition'
                }
              >
                {c.done ? '✓ ' : '○ '}
                {c.label}
                {!c.done && (
                  <span className={c.neutral ? 'text-gray-400' : 'text-amber-600'}> — {c.todo}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Client portal panel */}
        <div className="mt-5 border rounded-xl p-4 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Client Portal
          </p>
            {!file.portal_enabled ? (
              <button
                onClick={handleEnablePortal}
                disabled={portalBusy}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {portalBusy ? 'Generating…' : 'Enable Client Portal'}
              </button>
            ) : (
              <div>
                <p className="text-xs text-green-700 font-medium mb-2">✓ Client portal enabled</p>
                <button
                  onClick={copyPortalLink}
                  className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200"
                >
                  {copied ? 'Copied!' : 'Copy Client Link'}
                </button>
                <button
                  onClick={copyIdRequest}
                  className="mt-2 px-4 py-2 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium hover:bg-blue-200"
                >
                  Copy ID Request
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  Send this link to the client — they can view their checklist and upload documents.
                </p>
              </div>
            )}        </div>

        {/* Contact details — mirrors the contact record (same data,
            editable from either place) */}
        {file.crm_contact_id && contact && (
          <div className="mt-5 border-t pt-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Contact Details
                <span className="ml-2 text-xs font-normal text-gray-400">
                  the same record as the contact page — edits here update it there too
                </span>
              </h3>
              <div className="flex gap-2">
                <Link
                  href={`/dashboard/contacts/${file.crm_contact_id}`}
                  className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                >
                  Open full contact →
                </Link>
                {!editingContact ? (
                  <button
                    onClick={() => setEditingContact(true)}
                    className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    Edit details
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleSaveContact}
                      disabled={savingContact}
                      className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                    >
                      {savingContact ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingContact(false)}
                      className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
              {contactFields.map((f) => {
                const val = (cForm[f.key] || '').trim();
                return (
                  <div key={f.key}>
                    <p className="text-xs text-gray-400">
                      {f.label}
                      {f.fintrac && (
                        <span className="ml-1 text-[10px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded">
                          FINTRAC
                        </span>
                      )}
                    </p>
                    {editingContact ? (
                      <input
                        type={f.type || 'text'}
                        value={cForm[f.key] || ''}
                        onChange={(e) => setCForm({ ...cForm, [f.key]: e.target.value })}
                        className="mt-0.5 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                      />
                    ) : val ? (
                      <p className="text-sm text-gray-800 mt-0.5">{val}</p>
                    ) : f.fintrac && !has630 ? (
                      <p className="text-sm text-amber-600 mt-0.5">— needed for the 630</p>
                    ) : (
                      <p className="text-sm text-gray-400 mt-0.5">—</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* FINTRAC forms live with the facts they feed on.
                Proper names (Tim, 2026-10-23): 630 = Individual
                Identification Information Record; 635 = Receipt of
                Funds Record — due for a buyer only once there's an
                accepted offer, prefilled from the deal's deposit. */}
            <div className="mt-4 border-t pt-3">
              <div className="flex items-center flex-wrap gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">
                  FINTRAC
                </span>
                {file.crm_contact_id && (
                  <>
                    <button
                      onClick={handleGenerate630}
                      className={has630 ? "px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg border border-green-600" : "px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg border border-gray-300"}
                    >
                      {has630 ? '✓ ID Record (630)' : 'Fill ID Record (630)'}
                    </button>
                    <button
                      onClick={handleGenerate635}
                      className={has635 ? "px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg border border-green-600" : "px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg border border-gray-300"}
                    >
                      {has635 ? '✓ Receipt of Funds (635)' : 'Receipt of Funds (635)'}
                    </button>
                  </>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Individual Identification Information Record (630):{' '}
                {has630 ? 'on file ✓' : 'not filed yet'}
                {' · '}
                Receipt of Funds Record (635):{' '}
                {has635
                  ? 'on file ✓'
                  : fundsDue
                    ? 'due now — there is an accepted offer'
                    : isBuyerFile
                      ? 'after an accepted offer'
                      : 'when funds are received'}
              </p>
            </div>

            {/* Representation agreement — prepare the 371/372 from here */}
            {repKindHere && (
              <div className="mt-3 flex items-center flex-wrap gap-2 border-t pt-3">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">
                  Representation
                </span>
                <button
                  onClick={openRepPrep}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg border border-gray-300"
                >
                  Prepare Form {repKindHere}
                </button>
                {filePackages[0] ? (
                  <button
                    onClick={() => router.push(`/dashboard/offers/${filePackages[0].id}#rep`)}
                    className="px-3 py-1.5 text-xs bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 font-medium"
                  >
                    Open offer package →
                  </button>
                ) : (
                  <button
                    onClick={() => void startPackage()}
                    className="px-3 py-1.5 text-xs bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 font-medium"
                  >
                    Start offer package
                  </button>
                )}
                <span className="text-xs text-gray-500 ml-1">
                  {repReceived
                    ? 'Signed copy on file ✓'
                    : repDocs[0]?.file_url
                      ? 'Prepared — ready to send for signature'
                      : 'Not prepared yet'}
                </span>
              </div>
            )}

            {/* Listing agreement — prepare the 271/272 from here */}
            {listingKindHere && (
              <div className="mt-3 flex items-center flex-wrap gap-2 border-t pt-3">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">
                  Listing
                </span>
                <button
                  onClick={openLstPrep}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg border border-gray-300"
                >
                  Prepare Form {listingKindHere}
                </button>
                {filePackages[0] ? (
                  <button
                    onClick={() => router.push(`/dashboard/offers/${filePackages[0].id}#listing`)}
                    className="px-3 py-1.5 text-xs bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 font-medium"
                  >
                    Open offer package →
                  </button>
                ) : (
                  <button
                    onClick={() => void startPackage()}
                    className="px-3 py-1.5 text-xs bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 font-medium"
                  >
                    Start offer package
                  </button>
                )}
                <span className="text-xs text-gray-500 ml-1">
                  {repReceived
                    ? 'Signed copy on file ✓'
                    : repDocs[0]?.file_url
                      ? 'Prepared — ready to send for signature'
                      : 'Not prepared yet'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Deal info - editable */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Deal Details</h3>
            <div className="flex gap-2">
              {file.crm_contact_id && !editingDeal && (
                <button
                  onClick={fetchDealsForPicker}
                  className="text-xs px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 font-medium"
                >
                  Link Existing Deal
                </button>
              )}
              {!editingDeal ? (
                <button
                  onClick={() => setEditingDeal(true)}
                  className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                >
                  Edit Details
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingDeal(false)}
                    className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveDeal}
                    disabled={savingDeal}
                    className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                  >
                    {savingDeal ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Deal picker modal */}
          {showDealPicker && (
            <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-purple-900">
                  Select a deal to link:
                </p>
                <button
                  onClick={() => setShowDealPicker(false)}
                  className="text-xs text-purple-700 hover:underline"
                >
                  Close
                </button>
              </div>
              {loadingDeals ? (
                <p className="text-xs text-purple-700">Loading deals…</p>
              ) : contactDeals.length === 0 ? (
                <p className="text-xs text-purple-700">No deals found for this contact.</p>
              ) : (
                <div className="space-y-2">
                  {contactDeals.map((d: any) => (
                    <button
                      key={d.id}
                      onClick={() => linkDeal(d)}
                      className="w-full text-left px-3 py-2 rounded-lg border text-sm bg-white border-purple-200 hover:border-purple-400"
                    >
                      <span className="font-medium">{d.property?.address || 'No address'}</span>
                      {d.deal_type && <span className="ml-2 text-xs text-gray-500">({d.deal_type})</span>}
                      {d.status && <span className="ml-2 text-xs text-gray-500">— {d.status}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {editingDeal ? (
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Property address</label>
                <input value={fAddress} onChange={(e) => setFAddress(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="123 Main St, Whitby, ON" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Lawyer name</label>
                <input value={fLawyerName} onChange={(e) => setFLawyerName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Law firm</label>
                <input value={fLawyerFirm} onChange={(e) => setFLawyerFirm(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Lawyer contact</label>
                <input value={fLawyerContact} onChange={(e) => setFLawyerContact(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Phone / email" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Co-operating side</label>
                <input value={fCoop} onChange={(e) => setFCoop(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Other agent / brokerage" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Offer date</label>
                <input value={fOfferDate} onChange={(e) => setFOfferDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="2026-10-16" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Closing date</label>
                <input value={fClosingDate} onChange={(e) => setFClosingDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="2026-12-01" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Price / Rent</label>
                <input value={fPrice} onChange={(e) => setFPrice(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Deposit</label>
                <input value={fDeposit} onChange={(e) => setFDeposit(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Conditions + deadlines</label>
                <textarea value={fConditions} onChange={(e) => setFConditions(e.target.value)} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                {(file.phone || file.phone_email) && (
                  <div>
                    <p className="text-gray-500">Phone</p>
                    <p className="font-medium">{file.phone || file.phone_email}</p>
                  </div>
                )}
                {file.email && (
                  <div>
                    <p className="text-gray-500">Email</p>
                    <p className="font-medium">{file.email}</p>
                  </div>
                )}
                {(file.lawyer_name || file.lawyer_firm) && (
                  <div>
                    <p className="text-gray-500">Lawyer</p>
                    <p className="font-medium">
                      {file.lawyer_name}
                      {file.lawyer_firm ? ` — ${file.lawyer_firm}` : ''}
                    </p>
                    {file.lawyer_contact && <p className="text-gray-500">{file.lawyer_contact}</p>}
                  </div>
                )}
                {file.coop_info && (
                  <div>
                    <p className="text-gray-500">Co-operating side</p>
                    <p className="font-medium">{file.coop_info}</p>
                  </div>
                )}
                {file.deal_dates?.closing_date && (
                  <div>
                    <p className="text-gray-500">Closing date</p>
                    <p className="font-medium">{file.deal_dates.closing_date}</p>
                  </div>
                )}
                {file.deal_dates?.offer_date && (
                  <div>
                    <p className="text-gray-500">Offer date</p>
                    <p className="font-medium">{file.deal_dates.offer_date}</p>
                  </div>
                )}
                {file.financials?.price && (
                  <div>
                    <p className="text-gray-500">Price / Rent</p>
                    <p className="font-medium">{file.financials.price}</p>
                  </div>
                )}
                {file.crm_deal_id && (
                  <div>
                    <p className="text-gray-500">Linked deal</p>
                    <p className="font-medium text-purple-700">✓ Connected</p>
                  </div>
                )}
              </div>
              {file.conditions && (
                <p className="text-sm mt-4">
                  <span className="text-gray-500">Conditions: </span>
                  {file.conditions}
                </p>
              )}
              {!file.property_address && !file.lawyer_name && !file.deal_dates?.closing_date && (
                <p className="text-sm text-gray-400 mt-2 italic">
                  No deal details yet — click Edit Details to add them, or upload documents and fill in what they show.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Checklist tabs */}
      <div id="client-docs" className="flex gap-2 mt-6 border-b border-gray-200">
        {file.checklist_types.map((t) => {
          const ct = t as ChecklistType;
          const count = docs.filter(
            (d) => d.checklist_type === ct && ['received', 'waived', 'na'].includes(d.status)
          ).length;
          const total = docs.filter((d) => d.checklist_type === ct).length;
          return (
            <button
              key={t}
              onClick={() => setActiveTab(ct)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeTab === ct
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {CHECKLIST_TYPE_LABELS[ct]} ({count}/{total})
            </button>
          );
        })}
      </div>

      {/* Delete confirmation modal */}
      {lstPrep && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold">
              Prepare Form {lstPrep.kind} — {lstPrep.kind === '272' ? 'Landlord' : 'Seller'} Listing Agreement
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Filled from this file's details — the client names, the property address from Deal
              Details, and the price spelled out in words automatically. The prepared copy lands
              on the checklist row, ready to send for signature.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm font-medium">Designated representative</label>
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={lstPrep.designatedRep}
                  onChange={(e) => setLstPrep({ ...lstPrep, designatedRep: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Listing starts</label>
                  <input
                    type="date"
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={lstPrep.termStart}
                    onChange={(e) => setLstPrep({ ...lstPrep, termStart: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Listing expires</label>
                  <input
                    type="date"
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={lstPrep.termEnd}
                    onChange={(e) => setLstPrep({ ...lstPrep, termEnd: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{lstPrep.kind === '272' ? 'Rent (CDN$)' : 'List price (CDN$)'}</label>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder={lstPrep.kind === '272' ? '2400' : '784900'}
                    value={lstPrep.price}
                    onChange={(e) => setLstPrep({ ...lstPrep, price: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Holdover (days)</label>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={lstPrep.holdover}
                    onChange={(e) => setLstPrep({ ...lstPrep, holdover: e.target.value })}
                  />
                </div>
              </div>
              {lstPrep.kind === '271' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Total commission — %</label>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={lstPrep.totalPct}
                      onChange={(e) => setLstPrep({ ...lstPrep, totalPct: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Co-op brokerage — %</label>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={lstPrep.coopPct}
                      onChange={(e) => setLstPrep({ ...lstPrep, coopPct: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Total commission (wording)</label>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={lstPrep.totalText}
                      onChange={(e) => setLstPrep({ ...lstPrep, totalText: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Co-op brokerage commission (wording)</label>
                    <input
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={lstPrep.coopText}
                      onChange={(e) => setLstPrep({ ...lstPrep, coopText: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setLstPrep(null)}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={submitLstPrep}
                disabled={lstBusy}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
              >
                {lstBusy ? 'Preparing…' : `Prepare Form ${lstPrep.kind}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {repPrep && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold">
              Prepare Form {repPrep.kind} — {repPrep.kind === '372' ? 'Tenant' : 'Buyer'} Representation Agreement
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Filled from the contact details above. The prepared copy lands on the checklist
              row, ready to send for signature — for anything unusual, use the Representation
              tab in the offer workspace instead.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm font-medium">Designated representative</label>
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={repPrep.designatedRep}
                  onChange={(e) => setRepPrep({ ...repPrep, designatedRep: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Term starts</label>
                  <input
                    type="date"
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={repPrep.termStart}
                    onChange={(e) => setRepPrep({ ...repPrep, termStart: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Term expires</label>
                  <input
                    type="date"
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={repPrep.termEnd}
                    onChange={(e) => setRepPrep({ ...repPrep, termEnd: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Commission on purchase — %</label>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={repPrep.commPct}
                    onChange={(e) => setRepPrep({ ...repPrep, commPct: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Holdover (days)</label>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={repPrep.holdover}
                    onChange={(e) => setRepPrep({ ...repPrep, holdover: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Commission on a lease (if any)</label>
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. One month's rent plus HST"
                  value={repPrep.commLease}
                  onChange={(e) => setRepPrep({ ...repPrep, commLease: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Geographic location</label>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="e.g. Durham Region"
                    value={repPrep.geo}
                    onChange={(e) => setRepPrep({ ...repPrep, geo: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Property type / use</label>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="e.g. Residential"
                    value={repPrep.propType}
                    onChange={(e) => setRepPrep({ ...repPrep, propType: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setRepPrep(null)}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={submitRepPrep}
                disabled={repBusy}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
              >
                {repBusy ? 'Preparing…' : `Prepare Form ${repPrep.kind}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {fintracFix && file.crm_contact_id && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900">A couple of details for the FINTRAC form</h3>
            <p className="text-sm text-gray-600 mt-2">
              Form 630 needs these on the contact. Fill them in here — they&apos;re saved to the
              contact, so you only do this once.
            </p>
            <div className="space-y-3 mt-4">
              {fintracFix.needName && (
                <div className="flex gap-2">
                  <input
                    value={fintracFix.firstName}
                    onChange={(e) => setFintracFix({ ...fintracFix, firstName: e.target.value })}
                    placeholder="First name"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    value={fintracFix.lastName}
                    onChange={(e) => setFintracFix({ ...fintracFix, lastName: e.target.value })}
                    placeholder="Last name"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              )}
              {fintracFix.needOccupation && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Occupation</label>
                  <input
                    value={fintracFix.occupation}
                    onChange={(e) => setFintracFix({ ...fintracFix, occupation: e.target.value })}
                    placeholder="e.g. Registered Nurse"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              )}
              {fintracFix.needLicence && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Driver&apos;s licence number</label>
                  <input
                    value={fintracFix.licenceNumber}
                    onChange={(e) => setFintracFix({ ...fintracFix, licenceNumber: e.target.value })}
                    placeholder="Licence number"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  {fintracFix.licenceNote && (
                    <p className="text-xs text-gray-500 mt-1">
                      The licence is uploaded in this file, but its number didn&apos;t get read
                      automatically — type it in from the licence.
                    </p>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Prefer the full contact?{' '}
              <Link href={`/dashboard/contacts/${file.crm_contact_id}`} className="text-blue-600 hover:underline">
                Open the contact →
              </Link>
            </p>
            <div className="flex gap-3 mt-5 justify-end">
              <button
                onClick={() => setFintracFix(null)}
                disabled={fintracFixBusy}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFintracFix}
                disabled={fintracFixBusy}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {fintracFixBusy ? 'Saving…' : 'Save & Generate 630'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900">Delete this file?</h3>
            <p className="text-sm text-gray-600 mt-2">
              This will permanently delete <strong>{file.client_names}</strong> and all
              associated checklist documents. This cannot be undone.
            </p>
            <div className="flex gap-3 mt-6 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteFile}
                disabled={deleting}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stages */}
      {activeTab && (
        <div className="mt-6 space-y-8">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {received} of {tabDocs.length} documents received
            </p>
            <button
              onClick={handleDownloadAll}
              disabled={downloadingAll}
              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
            >
              {downloadingAll ? 'Preparing…' : 'Download all files'}
            </button>
          </div>
          {stages.map((stage, si) => {
            const stageDocs = tabDocs.filter((d) => d.stage_index === si);
            if (stageDocs.length === 0) return null;
            return (
              <div key={si} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 bg-gray-50 border-b border-gray-200">
                  <h3 className="font-semibold">{stage.title}</h3>
                  <p className="text-sm text-gray-500">{stage.description}</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {stageDocs.map((doc) => {
                    const badge = REQUIRED_BADGE[doc.required] || REQUIRED_BADGE.required;
                    return (
                      <div
                        key={doc.id}
                        className={`px-5 py-4 flex items-start gap-4 transition-colors ${
                          dragOverDocId === doc.id ? 'bg-blue-50 border-2 border-blue-300 border-dashed' : ''
                        }`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverDocId(doc.id);
                        }}
                        onDragLeave={() => setDragOverDocId(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          const files = e.dataTransfer.files;
                          if (files.length > 0) {
                            handleFileUpload(doc.id, files[0]);
                          }
                        }}
                      >
                        <button
                          onClick={() =>
                            setStatus(doc.id, doc.status === 'received' ? 'pending' : 'received')
                          }
                          className={`mt-0.5 w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                            ['received', 'waived', 'na'].includes(doc.status)
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'border-gray-300 hover:border-green-400'
                          }`}
                          title={['received', 'waived', 'na'].includes(doc.status) ? 'Mark as not received' : 'Mark as received'}
                        >
                          {['received', 'waived', 'na'].includes(doc.status) && (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p
                              className={`font-medium ${
                                ['received', 'waived', 'na'].includes(doc.status) ? 'line-through text-gray-400' : ''
                              }`}
                            >
                              {doc.document}
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${badge.className}`}>
                              {badge.label}
                            </span>
                            {doc.file_url && (
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline"
                              >
                                View file
                              </a>
                            )}
                          </div>
                          {doc.form && <p className="text-xs text-gray-500 mt-0.5">{doc.form}</p>}
                          {doc.beth_note && (
                            <p className="text-sm text-gray-500 mt-1">{doc.beth_note}</p>
                          )}
                          {doc.view_form && (
                            <a
                              href={doc.view_form}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                            >
                              View form →
                            </a>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          <select
                            value={doc.status}
                            onChange={(e) => setStatus(doc.id, e.target.value as ClientDocument['status'])}
                            className="text-xs border border-gray-300 rounded px-2 py-1"
                          >
                            <option value="pending">Pending</option>
                            <option value="received">Received</option>
                            <option value="waived">Waived</option>
                            <option value="na">N/A</option>
                          </select>
                          <label className="cursor-pointer text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium border border-blue-200">
                            {uploadingDocId === doc.id ? 'Uploading…' : doc.file_url ? 'Replace file' : 'Upload file'}
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingDocId === doc.id}
                              onChange={(e) => {
                                const files = e.target.files;
                                if (files && files.length > 0) {
                                  handleFileUpload(doc.id, files[0]);
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                          {doc.file_url && (
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Download →
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
