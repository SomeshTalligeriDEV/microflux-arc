export const resolveNFD = async (walletAddress: string): Promise<string | null> => {
  try {
    const response = await fetch(`https://api.nf.domains/nfd/lookup?address=${walletAddress}&view=tiny`);
    if (!response.ok) return null;
    
    const data = await response.json();
    return data[walletAddress]?.name || null;
  } catch (error) {
    console.error("NFD Resolution Error:", error);
    return null;
  }
};