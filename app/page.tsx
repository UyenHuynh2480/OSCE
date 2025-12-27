'use client';
import { supabase } from '../lib/supabaseClient';

export default function Home() {
  async function testConnection() {
    const { data, error } = await supabase.from('students').select('*');
    console.log(data, error);
  }

  return (
    <div>
      <h1>OSCE App</h1>
      <button onClick={testConnection}>Test Supabase</button>
    </div>
  );
}