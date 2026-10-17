const hre = require("hardhat");

async function main() {
  console.log("==================================================");
  console.log("  Deploying TapToOwnArena on Monad via Hardhat");
  console.log("==================================================");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("Network:", hre.network.name, "(Chain ID:", (await hre.ethers.provider.getNetwork()).chainId, ")");

  const TapToOwnArena = await hre.ethers.getContractFactory("TapToOwnArena");
  const arena = await TapToOwnArena.deploy(deployer.address);

  await arena.waitForDeployment();
  const address = await arena.getAddress();

  console.log("==================================================");
  console.log("  TapToOwnArena deployed successfully!");
  console.log("  Contract Address:", address);
  console.log("==================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
