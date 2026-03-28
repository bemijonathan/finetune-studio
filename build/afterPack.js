const { execSync } = require('child_process')
const path = require('path')

exports.default = async function (context) {
    if (process.platform !== 'darwin') return

    const appPath = path.join(
        context.appOutDir,
        `${context.packager.appInfo.productFilename}.app`
    )

    console.log('Re-signing app bundle for consistent ad-hoc identity...')

    // Sign all nested frameworks and helpers first, then the outer app
    const components = [
        'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework',
        'Contents/Frameworks/Electron Framework.framework',
        'Contents/Frameworks/Mantle.framework',
        'Contents/Frameworks/ReactiveObjC.framework',
        'Contents/Frameworks/Squirrel.framework',
        'Contents/Frameworks/FineTune Studio Helper.app',
        'Contents/Frameworks/FineTune Studio Helper (GPU).app',
        'Contents/Frameworks/FineTune Studio Helper (Plugin).app',
        'Contents/Frameworks/FineTune Studio Helper (Renderer).app',
        '.',
    ]

    for (const component of components) {
        const target = path.join(appPath, component)
        try {
            execSync(`codesign --force --sign - "${target}"`, { stdio: 'inherit' })
        } catch (e) {
            console.warn(`Warning: failed to sign ${component}:`, e.message)
        }
    }

    console.log('Re-signing complete.')
}
