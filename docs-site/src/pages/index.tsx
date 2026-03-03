import {useEffect} from 'react';
import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';

const targetPath = '/docs/manual-architecture';

export default function Home(): ReactNode {
  const targetUrl = useBaseUrl(targetPath);

  useEffect(() => {
    window.location.replace(targetUrl);
  }, [targetUrl]);

  return (
    <Layout title="跳转中" description="正在进入文档手册">
      <main style={{maxWidth: 820, margin: '72px auto', padding: '0 16px'}}>
        <h1 style={{fontSize: '1.4rem', marginBottom: '0.75rem'}}>正在进入手册…</h1>
        <p style={{color: '#4b5563'}}>如果没有自动跳转，请手动打开下方链接。</p>
        <p>
          <Link to={targetPath}>{targetUrl}</Link>
        </p>
      </main>
    </Layout>
  );
}