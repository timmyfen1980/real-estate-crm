'use client';

import { useState, useEffect } from 'react';

interface EmailIssue {
  id: string;
  to: string[];
  subject: string;
  created_at: string;
  last_event: string;
  contact_id: string | null;
  contact_name: string | null;
}

export default function EmailHealthPage() {
  const [issues, setIssues] = useState<EmailIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/email-health')
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setIssues(data.issues);
        } else {
          setError(data.error || 'Failed to load');
        }
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const getSuggestion = (issue: EmailIssue) => {
    const email = issue.to?.[0] || '';
    // Obvious test/fake emails
    if (email.includes('test') || email.includes('rtest') || email === 't@ff.cx' || email.includes('@fenn.ca')) {
      return { action: 'Delete', reason: 'Test email — safe to remove', color: 'red' };
    }
    // Obvious typos
    if (email.includes('.con') || email.includes('togers.com') || email.includes('@gmail.co')) {
      return { action: 'Fix typo', reason: 'Likely typo in domain', color: 'yellow' };
    }
    if (issue.last_event === 'complained') {
      return { action: 'Remove', reason: 'Marked as spam — must remove', color: 'red' };
    }
    return { action: 'Verify', reason: 'Check if email is still valid', color: 'blue' };
  };

  const handleAction = async (email: string, action: string, issueId: string) => {
    if (!confirm(`Are you sure you want to ${action.toLowerCase()} ${email}?`)) return;
    setActing(issueId);
    try {
      const res = await fetch('/api/email-health/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      // Remove from list
      setIssues(prev => prev.filter(i => i.id !== issueId));
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
    setActing(null);
  };

  if (loading) return <div className="p-8">Loading email health data...</div>;
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Email Health</h1>
      <p className="text-gray-600 mb-8">
        {issues.length} emails with delivery issues found. Review below to clean up your list.
      </p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-4 font-semibold">Email</th>
              <th className="text-left p-4 font-semibold">Issue</th>
              <th className="text-left p-4 font-semibold">Last Tried</th>
              <th className="text-left p-4 font-semibold">Suggestion</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => {
              const suggestion = getSuggestion(issue);
              const email = issue.to?.[0] || 'Unknown';
              return (
                <tr key={issue.id} className="border-t border-gray-100">
                  <td className="p-4 font-mono text-sm">{email}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      issue.last_event === 'bounced' ? 'bg-orange-100 text-orange-800' :
                      issue.last_event === 'complained' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {issue.last_event}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-600">
                    {new Date(issue.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      suggestion.color === 'red' ? 'bg-red-100 text-red-800' :
                      suggestion.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {suggestion.action}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">{suggestion.reason}</p>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {issue.contact_id && (
                        <a
                          href={`/dashboard/contacts/${issue.contact_id}`}
                          className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 inline-block"
                        >
                          View Contact{issue.contact_name ? ` (${issue.contact_name})` : ''}
                        </a>
                      )}
                      {suggestion.action === 'Fix typo' && (
                        <button
                          onClick={() => {
                            const fixed = prompt('Enter corrected email:', email);
                            if (fixed && fixed !== email) handleAction(email, 'fix:' + fixed, issue.id);
                          }}
                          disabled={acting === issue.id}
                          className="px-3 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700 disabled:opacity-50"
                        >
                          {acting === issue.id ? '...' : 'Fix Email'}
                        </button>
                      )}
                      <button
                        onClick={() => handleAction(email, 'delete', issue.id)}
                        disabled={acting === issue.id}
                        className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50"
                      >
                        {acting === issue.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {issues.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No delivery issues found. Your list is clean!
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>How to use this:</strong> "Delete" = safe to remove (test emails). "Fix typo" = obvious domain typos you can correct. "Verify" = real contacts — check if they have a new email before removing. "Remove" (spam complaints) = must delete to protect your sender reputation.
        </p>
      </div>
    </div>
  );
}
