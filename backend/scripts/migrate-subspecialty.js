/**
 * Migration automatique : remplace 'laryngologie' par 'cervicologie'
 * sur le champ subspecialty dans toutes les collections de contenu.
 *
 * Utilisation :
 *   DRY_RUN=true  node scripts/migrate-subspecialty.js   # ne modifie rien (compte seulement)
 *   DRY_RUN=false node scripts/migrate-subspecialty.js   # modifie la base pour de vrai
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') })

const { MongoClient } = require('mongodb')

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI
const DB_NAME = process.env.MONGODB_DB || 'orl-platform'
const DRY_RUN = process.env.DRY_RUN !== 'false' // par défaut true (sécurité)

const COLLECTIONS = ['videos', 'qcms', 'openQuestions', 'clinicalCases', 'diagrams']
const OLD_VALUE = 'laryngologie'
const NEW_VALUE = 'cervicologie'

async function main() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI (ou MONGO_URI) non défini dans le fichier .env')
    console.error('   Ajoutez-le puis relancez le script.')
    process.exit(1)
  }

  const client = new MongoClient(MONGODB_URI)
  try {
    await client.connect()
    const db = client.db(DB_NAME)

    console.log(`🔍 DRY_RUN=${DRY_RUN} | Base: ${DB_NAME}`)
    console.log(`📦 Remplacement '${OLD_VALUE}' → '${NEW_VALUE}' sur le champ subspecialty\n`)

    let totalMatched = 0
    let totalModified = 0

    for (const colName of COLLECTIONS) {
      const count = await db.collection(colName).countDocuments({ subspecialty: OLD_VALUE })
      console.log(`📁 ${colName}: ${count} document(s) avec subspecialty='${OLD_VALUE}'`)
      totalMatched += count

      if (DRY_RUN) {
        console.log(`   ⏭️  (dry-run — aucune modification)`)
      } else if (count > 0) {
        const result = await db.collection(colName).updateMany(
          { subspecialty: OLD_VALUE },
          { $set: { subspecialty: NEW_VALUE } }
        )
        console.log(`   ✅ Modifié: ${result.modifiedCount} document(s)`)
        totalModified += result.modifiedCount
      } else {
        console.log(`   ℹ️  Aucun document à migrer`)
      }
    }

    console.log(`\n📊 Total trouvé: ${totalMatched}`)

    if (DRY_RUN) {
      console.log('\n💡 Pour exécuter la modification pour de vrai :')
      console.log('   DRY_RUN=false node scripts/migrate-subspecialty.js')
    } else {
      console.log(`\n✅ Migration terminée. Total modifié: ${totalModified}`)
    }
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
