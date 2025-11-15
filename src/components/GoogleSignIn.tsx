import React, { useEffect, useRef } from 'react'
import { api } from '../config/api'

declare global {
  interface Window {
    google: any;
  }
}

interface GoogleSignInProps {
  onSuccess?: (response: any) => void
  onError?: (error: any) => void
  text?: string
  className?: string
}

const GoogleSignIn: React.FC<GoogleSignInProps> = ({ 
  onSuccess, 
  onError, 
  className = ""
}) => {
  const googleButtonRef = useRef<HTMLDivElement>(null)
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "998061933872-l0l8js3v7mgu2d03d72g4rp171jlvdaq.apps.googleusercontent.com"

  useEffect(() => {
    const initializeGoogleSignIn = () => {
      if (window.google && googleButtonRef.current) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        })

        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          width: '100%',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left'
        })
      }
    }

    const handleGoogleResponse = async (response: any) => {
      try {
        console.log('Google Sign-In response:', response)
        
        // Send the credential to your backend
        const backendResponse = await fetch(api('/api/user/auth'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            idToken: response.credential
          })
        })

        if (backendResponse.ok) {
          const data = await backendResponse.json()
          console.log('Backend auth response:', data)
          
          if (onSuccess) {
            onSuccess(data)
          }
        } else {
          const errorData = await backendResponse.json()
          console.error('Backend auth failed:', errorData)
          
          if (onError) {
            onError(errorData)
          }
        }
      } catch (error) {
        console.error('Google Sign-In error:', error)
        if (onError) {
          onError(error)
        }
      }
    }

    // Check if Google script is already loaded
    if (window.google) {
      initializeGoogleSignIn()
    } else {
      // Wait for Google script to load
      const checkGoogleLoaded = setInterval(() => {
        if (window.google) {
          clearInterval(checkGoogleLoaded)
          initializeGoogleSignIn()
        }
      }, 100)

      // Cleanup interval after 10 seconds
      setTimeout(() => {
        clearInterval(checkGoogleLoaded)
      }, 10000)
    }
  }, [onSuccess, onError])

  return (
    <div className={`w-full ${className}`}>
      <div ref={googleButtonRef} className="w-full"></div>
    </div>
  )
}

export default GoogleSignIn
